mod ast;
mod bundle;
mod check;
mod declarations;
mod files;
mod watch;

use std::collections::BTreeMap;
use std::path::Path;

use anyhow::{Context, Result, bail};

pub async fn run(types: bool, input: &Path) -> Result<()> {
    let cwd = std::env::current_dir().context("failed to read the working directory")?;
    let files = files::find_dag_files(input)?;

    let violations = check::find_violations(&files)?;
    if !violations.is_empty() {
        bail!("invalid DAG modules:\n{}", violations.join("\n"));
    }

    let input_root = if input.is_absolute() {
        input.to_path_buf()
    } else {
        cwd.join(input)
    };
    let input_root = input_root
        .canonicalize()
        .with_context(|| format!("failed to resolve {}", input.display()))?;

    let output_dir = bundle::reset_output_dir(&cwd)?;
    let mut dags = BTreeMap::new();
    for path in &files {
        let canonical = watch::canonical_path(path)?;
        let watch_files = bundle::bundle(&cwd, &output_dir, path).await?;
        dags.insert(
            canonical.clone(),
            watch::Dag {
                path: path.clone(),
                canonical,
                watch_files,
            },
        );
    }

    if types {
        declarations::emit(&output_dir, &files)?;
    }

    watch::run(&cwd, input, &input_root, &output_dir, types, &mut dags).await
}
