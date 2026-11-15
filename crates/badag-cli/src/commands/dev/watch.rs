use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use super::{bundle, check, declarations, files, shutdown};

const DEBOUNCE: Duration = Duration::from_millis(75);

pub(super) struct Dag {
    pub(super) path: PathBuf,
    pub(super) canonical: PathBuf,
    pub(super) watch_files: HashSet<PathBuf>,
}

struct DevContext<'a> {
    cwd: &'a Path,
    input: &'a Path,
    input_root: &'a Path,
    output_dir: &'a Path,
    types: bool,
}

pub(super) fn canonical_path(path: &Path) -> Result<PathBuf> {
    path.canonicalize()
        .with_context(|| format!("failed to resolve {}", path.display()))
}

pub(super) async fn run(
    cwd: &Path,
    input: &Path,
    input_root: &Path,
    output_dir: &Path,
    types: bool,
    shutdown: &mut shutdown::Signals,
    dags: &mut BTreeMap<PathBuf, Dag>,
) -> Result<()> {
    let context = DevContext {
        cwd,
        input,
        input_root,
        output_dir,
        types,
    };
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = tx.send(event);
    })
    .context("failed to create a file watcher")?;

    watcher
        .watch(input_root, RecursiveMode::Recursive)
        .with_context(|| format!("failed to watch {}", input_root.display()))?;

    let mut watched_dirs = HashSet::from([input_root.to_path_buf()]);
    refresh_watches(&context, &mut watcher, &mut watched_dirs, dags);

    println!("Watching {} for changes", input.display());

    'watching: loop {
        let event = tokio::select! {
            result = shutdown.wait() => {
                result?;
                break;
            }
            event = rx.recv() => match event {
                Some(event) => event,
                None => break,
            },
        };
        let mut changed = HashSet::new();
        collect_paths(event, output_dir, &mut changed);
        if changed.is_empty() {
            continue;
        }

        loop {
            let debounce = tokio::select! {
                result = shutdown.wait() => {
                    result?;
                    break 'watching;
                }
                result = tokio::time::timeout(DEBOUNCE, rx.recv()) => result,
            };
            match debounce {
                Ok(Some(event)) => collect_paths(event, output_dir, &mut changed),
                Ok(None) | Err(_) => break,
            }
        }

        if changed.is_empty() {
            continue;
        }
        let changed = changed
            .into_iter()
            .map(|path| resolve_path(&path))
            .collect();
        rebuild(&context, dags, &changed, &mut watcher, &mut watched_dirs).await?;
    }

    Ok(())
}

fn collect_paths(event: notify::Result<Event>, output_dir: &Path, changed: &mut HashSet<PathBuf>) {
    let Ok(event) = event else {
        return;
    };
    if matches!(event.kind, EventKind::Access(_)) {
        return;
    }

    for path in event.paths {
        if is_ignored(&path, output_dir) {
            continue;
        }
        changed.insert(path);
    }
}

fn is_ignored(path: &Path, output_dir: &Path) -> bool {
    path.starts_with(output_dir)
        || path
            .components()
            .any(|component| component.as_os_str() == OsStr::new("node_modules"))
}

fn resolve_path(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| {
        path.parent()
            .and_then(|parent| parent.canonicalize().ok())
            .and_then(|parent| path.file_name().map(|name| parent.join(name)))
            .unwrap_or_else(|| path.to_path_buf())
    })
}

async fn rebuild(
    context: &DevContext<'_>,
    dags: &mut BTreeMap<PathBuf, Dag>,
    changed: &HashSet<PathBuf>,
    watcher: &mut RecommendedWatcher,
    watched_dirs: &mut HashSet<PathBuf>,
) -> Result<()> {
    let mut current = BTreeMap::new();
    for path in files::find_dag_files(context.input)? {
        let canonical = canonical_path(&path)?;
        current.insert(canonical, path);
    }

    let removed: Vec<PathBuf> = dags
        .keys()
        .filter(|key| !current.contains_key(*key))
        .cloned()
        .collect();
    for key in removed {
        if let Some(dag) = dags.remove(&key) {
            bundle::remove_output(context.output_dir, &dag.path)?;
            println!("Removed {} DAG", bundle::display_name(&dag.path));
        }
    }

    let mut affected = BTreeSet::new();
    for (canonical, path) in current {
        if !dags.contains_key(&canonical) {
            dags.insert(
                canonical.clone(),
                Dag {
                    path,
                    canonical: canonical.clone(),
                    watch_files: HashSet::new(),
                },
            );
            affected.insert(canonical);
        }
    }

    for path in changed {
        if dags.contains_key(path) {
            affected.insert(path.clone());
        }
        for dag in dags.values() {
            if dag.watch_files.contains(path) {
                affected.insert(dag.canonical.clone());
            }
        }
    }

    for canonical in affected {
        let Some(dag) = dags.get(&canonical) else {
            continue;
        };
        let path = dag.path.clone();
        let name = bundle::display_name(&path);

        println!("Rebundling {name} DAG");
        match rebundle(context, &path).await {
            Ok(watch_files) => {
                if let Some(dag) = dags.get_mut(&canonical) {
                    dag.watch_files = watch_files;
                }
            }
            Err(error) => eprintln!("failed to rebundle {name}: {error:#}"),
        }
    }

    refresh_watches(context, watcher, watched_dirs, dags);

    Ok(())
}

async fn rebundle(context: &DevContext<'_>, path: &Path) -> Result<HashSet<PathBuf>> {
    let violations = check::find_violations(&[path.to_path_buf()])?;
    if !violations.is_empty() {
        bail!("invalid DAG module:\n{}", violations.join("\n"));
    }

    let watch_files = bundle::bundle(context.cwd, context.output_dir, path).await?;
    if context.types {
        declarations::emit_one(context.output_dir, path)?;
    }

    Ok(watch_files)
}

fn refresh_watches(
    context: &DevContext<'_>,
    watcher: &mut RecommendedWatcher,
    watched_dirs: &mut HashSet<PathBuf>,
    dags: &BTreeMap<PathBuf, Dag>,
) {
    for dag in dags.values() {
        for file in &dag.watch_files {
            if file.starts_with(context.input_root) {
                continue;
            }
            let Some(parent) = file.parent() else {
                continue;
            };
            if !watched_dirs.insert(parent.to_path_buf()) {
                continue;
            }

            if let Err(error) = watcher.watch(parent, RecursiveMode::NonRecursive) {
                watched_dirs.remove(parent);
                eprintln!("failed to watch {}: {error}", parent.display());
            }
        }
    }
}
