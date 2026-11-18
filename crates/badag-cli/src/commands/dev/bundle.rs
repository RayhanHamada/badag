use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow, bail};
use rolldown::{Bundler, BundlerOptions, CodeSplittingMode, InputItem, OutputFormat, Platform};
use rolldown_error::EventKind;

const OUTPUT_DIR: &str = ".badag/output";

pub(super) fn reset_output_dir(cwd: &Path) -> Result<PathBuf> {
    let output_dir = cwd.join(OUTPUT_DIR);
    match fs::remove_dir_all(&output_dir) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            return Err(error).with_context(|| format!("failed to clear {}", output_dir.display()));
        }
    }
    fs::create_dir_all(&output_dir)
        .with_context(|| format!("failed to create {}", output_dir.display()))?;
    output_dir
        .canonicalize()
        .with_context(|| format!("failed to resolve {}", output_dir.display()))
}

pub(super) fn display_name(path: &Path) -> String {
    path.file_stem()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

pub(super) fn remove_output(output_dir: &Path, path: &Path) -> Result<()> {
    let name = display_name(path);
    for extension in ["js", "d.ts"] {
        let output = output_dir.join(format!("{name}.{extension}"));
        match fs::remove_file(&output) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("failed to remove {}", output.display()));
            }
        }
    }

    Ok(())
}

pub(super) async fn bundle(cwd: &Path, output_dir: &Path, path: &Path) -> Result<HashSet<PathBuf>> {
    let name = path
        .file_stem()
        .and_then(OsStr::to_str)
        .with_context(|| format!("invalid DAG file name: {}", path.display()))?;

    let mut bundler = Bundler::new(BundlerOptions {
        input: Some(vec![InputItem {
            name: Some(name.to_owned()),
            import: path.to_string_lossy().into_owned(),
        }]),
        cwd: Some(cwd.to_path_buf()),
        dir: Some(output_dir.to_string_lossy().into_owned()),
        entry_filenames: Some("[name].js".to_owned().into()),
        format: Some(OutputFormat::Esm),
        platform: Some(Platform::Node),
        code_splitting: Some(CodeSplittingMode::Bool(false)),
        ..Default::default()
    })
    .map_err(|error| {
        anyhow!(
            "failed to configure bundler for {}: {error}",
            path.display()
        )
    })?;

    let output = bundler
        .generate()
        .await
        .map_err(|error| anyhow!("failed to bundle {}: {error}", path.display()))?;

    if let Some(warning) = output
        .warnings
        .iter()
        .find(|warning| matches!(warning.kind(), EventKind::UnresolvedImport))
    {
        bail!(
            "failed to bundle {}: unresolved import; the DAG must resolve every dependency\n{warning}",
            path.display()
        );
    }

    let [script] = output.assets.as_slice() else {
        bail!(
            "failed to bundle {}: expected one script, got {}",
            path.display(),
            output.assets.len()
        );
    };
    let script_path = output_dir.join(script.filename());
    fs::write(&script_path, script.content_as_bytes())
        .with_context(|| format!("failed to write {}", script_path.display()))?;

    Ok(user_watch_files(cwd, &bundler))
}

fn user_watch_files(cwd: &Path, bundler: &Bundler) -> HashSet<PathBuf> {
    bundler
        .watch_files()
        .iter()
        .filter_map(|id| {
            let id: &str = id.as_ref();
            if id.is_empty() || id.starts_with("rolldown:") || id.starts_with('\0') {
                return None;
            }

            let path = Path::new(id);
            let path = if path.is_absolute() {
                path.to_path_buf()
            } else {
                cwd.join(path)
            };
            let is_external = path
                .components()
                .any(|component| component.as_os_str() == OsStr::new("node_modules"));
            if is_external {
                return None;
            }

            Some(path.canonicalize().unwrap_or(path))
        })
        .collect()
}
