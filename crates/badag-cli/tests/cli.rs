use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const BIN: &str = env!("CARGO_BIN_EXE_badag");
const DEV_TIMEOUT: Duration = Duration::from_secs(15);

fn badag(args: &[&str]) -> Output {
    Command::new(BIN)
        .args(args)
        .output()
        .expect("badag should be runnable")
}

fn badag_in(cwd: &Path, args: &[&str]) -> Output {
    Command::new(BIN)
        .args(args)
        .current_dir(cwd)
        .output()
        .expect("badag should be runnable")
}

fn stdout_of(output: &Output) -> String {
    String::from_utf8(output.stdout.clone()).expect("output is UTF-8")
}

fn stderr_of(output: &Output) -> String {
    String::from_utf8(output.stderr.clone()).expect("output is UTF-8")
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("badag-cli-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn file_names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .expect("output directory should exist")
        .map(|entry| {
            entry
                .expect("output entry should be readable")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    names.sort();
    names
}

fn file_contains(path: &Path, needle: &str) -> bool {
    fs::read_to_string(path).is_ok_and(|source| source.contains(needle))
}

struct DevProcess {
    child: Child,
    lines: Receiver<String>,
    buffered: Vec<String>,
    stderr: Receiver<String>,
    stdout_thread: Option<JoinHandle<()>>,
    stderr_thread: Option<JoinHandle<()>>,
    finished: bool,
}

impl DevProcess {
    fn spawn(cwd: &Path, args: &[&str]) -> Self {
        let mut child = Command::new(BIN)
            .args(args)
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("badag should be runnable");
        let stdout = child.stdout.take().expect("stdout should be piped");
        let stderr = child.stderr.take().expect("stderr should be piped");

        let (line_tx, lines) = mpsc::channel();
        let stdout_thread = thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if line_tx.send(line).is_err() {
                    break;
                }
            }
        });

        let (error_tx, error_lines) = mpsc::channel();
        let stderr_thread = thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if error_tx.send(line).is_err() {
                    break;
                }
            }
        });

        Self {
            child,
            lines,
            buffered: Vec::new(),
            stderr: error_lines,
            stdout_thread: Some(stdout_thread),
            stderr_thread: Some(stderr_thread),
            finished: false,
        }
    }

    fn wait_until(&mut self, done: impl Fn() -> bool) {
        let deadline = Instant::now() + DEV_TIMEOUT;
        while !done() {
            if let Some(status) = self.child.try_wait().expect("child status is readable") {
                let (stdout, stderr) = self.finish();
                panic!("badag exited early ({status})\nstdout:\n{stdout}\nstderr:\n{stderr}");
            }
            assert!(Instant::now() < deadline, "timed out waiting for badag dev");
            thread::sleep(Duration::from_millis(25));
        }
    }

    fn wait_for_line(&mut self, needle: &str) {
        let deadline = Instant::now() + DEV_TIMEOUT;
        loop {
            if self.buffered.iter().any(|line| line.contains(needle)) {
                return;
            }

            match self.lines.recv_timeout(Duration::from_millis(25)) {
                Ok(line) => {
                    let matched = line.contains(needle);
                    self.buffered.push(line);
                    if matched {
                        return;
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    if let Some(status) = self.child.try_wait().expect("child status is readable") {
                        let (stdout, stderr) = self.finish();
                        panic!(
                            "badag exited before {needle:?} ({status})\nstdout:\n{stdout}\nstderr:\n{stderr}"
                        );
                    }
                    assert!(
                        Instant::now() < deadline,
                        "timed out waiting for {needle:?}"
                    );
                }
                Err(RecvTimeoutError::Disconnected) => {
                    let (stdout, stderr) = self.finish();
                    panic!(
                        "badag closed stdout before {needle:?}\nstdout:\n{stdout}\nstderr:\n{stderr}"
                    );
                }
            }
        }
    }

    fn finish(&mut self) -> (String, String) {
        self.finished = true;
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(handle) = self.stdout_thread.take() {
            let _ = handle.join();
        }
        if let Some(handle) = self.stderr_thread.take() {
            let _ = handle.join();
        }

        let mut stdout = String::new();
        for line in self.buffered.drain(..) {
            stdout.push_str(&line);
            stdout.push('\n');
        }
        for line in self.lines.try_iter() {
            stdout.push_str(&line);
            stdout.push('\n');
        }

        let mut stderr = String::new();
        for line in self.stderr.try_iter() {
            stderr.push_str(&line);
            stderr.push('\n');
        }

        (stdout, stderr)
    }

    #[cfg(unix)]
    fn terminate(&self, signal: &str) {
        let status = Command::new("kill")
            .arg(format!("-{signal}"))
            .arg(self.child.id().to_string())
            .status()
            .expect("kill should run");
        assert!(status.success(), "failed to send SIG{signal}");
    }

    #[cfg(unix)]
    fn wait_for_exit(&mut self) -> std::process::ExitStatus {
        let deadline = Instant::now() + DEV_TIMEOUT;
        loop {
            if let Some(status) = self.child.try_wait().expect("child status is readable") {
                return status;
            }
            assert!(
                Instant::now() < deadline,
                "timed out waiting for badag to exit"
            );
            thread::sleep(Duration::from_millis(25));
        }
    }
}

impl Drop for DevProcess {
    fn drop(&mut self) {
        if !self.finished {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

#[test]
fn dev_lists_scripts_from_the_working_directory_dags_folder() {
    let cwd = temp_dir("dev");
    let dags = cwd.join("dags");
    fs::create_dir(&dags).unwrap();
    for name in ["zeta.ts", "alpha.mjs", "middle.js"] {
        fs::write(dags.join(name), "export default createDAG(\"fixture\");\n").unwrap();
    }
    for name in ["readme.md", "logo.png"] {
        fs::write(dags.join(name), "").unwrap();
    }
    fs::create_dir_all(cwd.join("other")).unwrap();
    fs::write(cwd.join("other/ignored.ts"), "").unwrap();

    let output_dir = cwd.join(".badag/output");
    let mut dev = DevProcess::spawn(&cwd, &["dev"]);
    dev.wait_for_line("Watching dags for changes");
    let (stdout, stderr) = dev.finish();

    assert_eq!(stdout, "Watching dags for changes\n");
    assert!(stderr.is_empty(), "{stderr}");
    assert_eq!(
        file_names(&output_dir),
        ["alpha.js", "middle.js", "zeta.js"]
    );

    for name in ["alpha.js", "middle.js", "zeta.js"] {
        let code = fs::read_to_string(output_dir.join(name)).unwrap();
        assert!(code.contains("export"), "{name} is not an ES module");
    }

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_reads_dags_from_the_requested_input_directory() {
    let cwd = temp_dir("dev-input");
    let graphs = cwd.join("graphs");
    fs::create_dir(&graphs).unwrap();
    fs::write(
        graphs.join("alpha.ts"),
        "export default createDAG(\"fixture\");\n",
    )
    .unwrap();

    let output_dir = cwd.join(".badag/output");
    let mut dev = DevProcess::spawn(&cwd, &["dev", "--input", "graphs"]);
    dev.wait_for_line("Watching graphs for changes");
    let (stdout, stderr) = dev.finish();

    assert_eq!(stdout, "Watching graphs for changes\n");
    assert!(stderr.is_empty(), "{stderr}");
    assert_eq!(file_names(&output_dir), ["alpha.js"]);

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_emits_declarations_with_the_short_type_flag() {
    let cwd = temp_dir("dev-types-short");
    let dags = cwd.join("dags");
    fs::create_dir(&dags).unwrap();
    fs::write(
        dags.join("alpha.ts"),
        "export default createDAG(\"fixture\");\n",
    )
    .unwrap();

    let output_dir = cwd.join(".badag/output");
    let mut dev = DevProcess::spawn(&cwd, &["dev", "-t"]);
    dev.wait_for_line("Watching dags for changes");
    let (_, stderr) = dev.finish();

    assert!(stderr.is_empty(), "{stderr}");
    assert_eq!(file_names(&output_dir), ["alpha.d.ts", "alpha.js"]);

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_accepts_the_working_directory_as_input() {
    let cwd = temp_dir("dev-input-cwd");
    fs::write(
        cwd.join("alpha.ts"),
        "export default createDAG(\"fixture\");\n",
    )
    .unwrap();

    let output_dir = cwd.join(".badag/output");
    let mut dev = DevProcess::spawn(&cwd, &["dev", "--input", "."]);
    dev.wait_for_line("Watching . for changes");
    let (stdout, stderr) = dev.finish();

    assert_eq!(stdout, "Watching . for changes\n");
    assert!(stderr.is_empty(), "{stderr}");
    assert_eq!(file_names(&output_dir), ["alpha.js"]);

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_reports_files_without_a_default_export() {
    let cwd = temp_dir("dev-invalid");
    let dags = cwd.join("dags");
    fs::create_dir(&dags).unwrap();
    fs::write(
        dags.join("good.ts"),
        "export default createDAG(\"fixture\");\n",
    )
    .unwrap();
    fs::write(dags.join("missing.ts"), "export const value = 1;\n").unwrap();
    fs::write(dags.join("broken.ts"), "export default ;\n").unwrap();
    fs::write(dags.join("not-dag.ts"), "export default 1;\n").unwrap();

    let output = badag_in(&cwd, &["dev"]);

    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());

    let stderr = stderr_of(&output);
    assert!(stderr.contains("invalid DAG modules"), "{stderr}");
    assert!(stderr.contains("broken.ts: failed to parse"), "{stderr}");
    assert!(
        stderr.contains("missing.ts: missing default export"),
        "{stderr}"
    );
    assert!(
        stderr.contains("not-dag.ts: default export is not a DAG"),
        "{stderr}"
    );

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_fails_when_the_working_directory_has_no_dags_folder() {
    let cwd = temp_dir("no-dags");

    let output = badag_in(&cwd, &["dev"]);

    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());

    let stderr = stderr_of(&output);
    assert!(stderr.contains("failed to read dags"), "{stderr}");

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_fails_when_a_dag_import_does_not_resolve() {
    let cwd = temp_dir("dev-unresolved");
    let dags = cwd.join("dags");
    fs::create_dir(&dags).unwrap();
    fs::write(
        dags.join("missing.ts"),
        "import { createDAG } from \"@badag/sdk\";\nexport default createDAG(\"fixture\");\n",
    )
    .unwrap();

    let output = badag_in(&cwd, &["dev"]);

    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());

    let stderr = stderr_of(&output);
    assert!(stderr.contains("unresolved import"), "{stderr}");
    assert!(stderr.contains("@badag/sdk"), "{stderr}");
    assert!(file_names(&cwd.join(".badag/output")).is_empty());

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_bundles_the_typescript_dag_fixture() {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/typescript-dag");
    let badag_dir = fixture.join(".badag");
    let output_dir = badag_dir.join("output");
    let _ = fs::remove_dir_all(&badag_dir);

    let expected = "Watching dags for changes\n";

    let mut dev = DevProcess::spawn(&fixture, &["dev"]);
    dev.wait_for_line("Watching dags for changes");
    let (stdout, stderr) = dev.finish();

    assert_eq!(stdout, expected);
    assert!(stderr.is_empty(), "{stderr}");
    assert_eq!(
        file_names(&output_dir),
        ["branching.js", "linear.js", "scheduled.js"]
    );

    for name in ["branching.js", "linear.js", "scheduled.js"] {
        let code = fs::read_to_string(output_dir.join(name)).unwrap();
        assert!(code.contains("export"), "{name} is not an ES module");
        assert!(!code.contains("@badag/sdk"), "{name} kept the SDK external");
    }

    let mut dev = DevProcess::spawn(&fixture, &["dev", "--types"]);
    dev.wait_for_line("Watching dags for changes");
    let (stdout, stderr) = dev.finish();

    assert_eq!(stdout, expected);
    assert!(stderr.is_empty(), "{stderr}");
    assert_eq!(
        file_names(&output_dir),
        [
            "branching.d.ts",
            "branching.js",
            "linear.d.ts",
            "linear.js",
            "scheduled.d.ts",
            "scheduled.js",
        ]
    );

    let declaration = fs::read_to_string(output_dir.join("linear.d.ts")).unwrap();
    assert_eq!(
        declaration,
        "import type { createDAG } from \"@badag/sdk\";\n\ndeclare const dag: ReturnType<typeof createDAG<\"fixture-pricing\">>;\nexport default dag;\n"
    );

    let mut dev = DevProcess::spawn(&fixture, &["dev"]);
    dev.wait_for_line("Watching dags for changes");
    let (stdout, stderr) = dev.finish();

    assert_eq!(stdout, expected);
    assert!(stderr.is_empty(), "{stderr}");
    assert_eq!(
        file_names(&output_dir),
        ["branching.js", "linear.js", "scheduled.js"]
    );

    fs::remove_dir_all(&badag_dir).unwrap();
}

#[test]
fn dev_bundles_each_dag_into_one_script() {
    let cwd = temp_dir("dev-bundle");
    let dags = cwd.join("dags");
    let lib = cwd.join("lib");
    fs::create_dir_all(&dags).unwrap();
    fs::create_dir_all(&lib).unwrap();

    fs::write(
        lib.join("shared.ts"),
        "export const createDAG = (name: string) => ({ name });\nexport const marker = \"shared-helper\";\n",
    )
    .unwrap();
    fs::write(
        lib.join("lazy.ts"),
        "export const lazyMarker = \"lazy-helper\";\n",
    )
    .unwrap();

    let source = "import { createDAG, marker } from \"../lib/shared.ts\";\nexport { marker };\nexport const lazy = () => import(\"../lib/lazy.ts\");\nexport default createDAG(\"bundled\");\n";
    fs::write(dags.join("alpha.ts"), source).unwrap();
    fs::write(dags.join("beta.ts"), source).unwrap();

    let output_dir = cwd.join(".badag/output");
    let mut dev = DevProcess::spawn(&cwd, &["dev"]);
    dev.wait_for_line("Watching dags for changes");
    let (stdout, stderr) = dev.finish();

    assert_eq!(stdout, "Watching dags for changes\n");
    assert!(stderr.is_empty(), "{stderr}");
    assert_eq!(file_names(&output_dir), ["alpha.js", "beta.js"]);

    for name in ["alpha.js", "beta.js"] {
        let code = fs::read_to_string(output_dir.join(name)).unwrap();
        assert!(
            code.contains("shared-helper"),
            "{name} did not inline the shared module"
        );
        assert!(
            code.contains("lazy-helper"),
            "{name} did not inline the dynamic import"
        );
    }

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_rebundles_a_changed_dag() {
    let cwd = temp_dir("dev-watch-dag");
    let dags = cwd.join("dags");
    fs::create_dir(&dags).unwrap();
    let source = "export const marker = \"one\";\nexport default createDAG(\"alpha\");\n";
    fs::write(dags.join("alpha.ts"), source).unwrap();

    let output_dir = cwd.join(".badag/output");
    let mut dev = DevProcess::spawn(&cwd, &["dev"]);
    dev.wait_for_line("Watching dags for changes");
    assert!(file_contains(&output_dir.join("alpha.js"), "one"));

    fs::write(
        dags.join("alpha.ts"),
        "export const marker = \"two\";\nexport default createDAG(\"alpha\");\n",
    )
    .unwrap();

    dev.wait_for_line("Rebundling alpha DAG");
    dev.wait_until(|| file_contains(&output_dir.join("alpha.js"), "two"));
    let (stdout, stderr) = dev.finish();

    assert!(stdout.contains("Rebundling alpha DAG"), "{stdout}");
    assert!(stderr.is_empty(), "{stderr}");

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_rebundles_every_dag_that_imports_a_changed_module() {
    let cwd = temp_dir("dev-watch-import");
    let dags = cwd.join("dags");
    let lib = cwd.join("lib");
    fs::create_dir_all(&dags).unwrap();
    fs::create_dir_all(&lib).unwrap();

    let shared =
        "export const createDAG = (name: string) => ({ name });\nexport const marker = \"one\";\n";
    fs::write(lib.join("shared.ts"), shared).unwrap();

    let source = "import { createDAG, marker } from \"../lib/shared.ts\";\nexport { marker };\nexport default createDAG(\"dag\");\n";
    fs::write(dags.join("alpha.ts"), source).unwrap();
    fs::write(dags.join("beta.ts"), source).unwrap();

    let output_dir = cwd.join(".badag/output");
    let mut dev = DevProcess::spawn(&cwd, &["dev"]);
    dev.wait_for_line("Watching dags for changes");
    assert!(file_contains(&output_dir.join("alpha.js"), "one"));
    assert!(file_contains(&output_dir.join("beta.js"), "one"));

    fs::write(
        lib.join("shared.ts"),
        "export const createDAG = (name: string) => ({ name });\nexport const marker = \"two\";\n",
    )
    .unwrap();

    dev.wait_for_line("Rebundling alpha DAG");
    dev.wait_for_line("Rebundling beta DAG");
    dev.wait_until(|| {
        file_contains(&output_dir.join("alpha.js"), "two")
            && file_contains(&output_dir.join("beta.js"), "two")
    });
    let (stdout, stderr) = dev.finish();

    assert!(stdout.contains("Rebundling alpha DAG"), "{stdout}");
    assert!(stdout.contains("Rebundling beta DAG"), "{stdout}");
    assert!(stderr.is_empty(), "{stderr}");

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_bundles_a_dag_added_to_the_input_directory() {
    let cwd = temp_dir("dev-watch-add");
    let dags = cwd.join("dags");
    fs::create_dir(&dags).unwrap();
    fs::write(
        dags.join("alpha.ts"),
        "export default createDAG(\"alpha\");\n",
    )
    .unwrap();

    let output_dir = cwd.join(".badag/output");
    let mut dev = DevProcess::spawn(&cwd, &["dev"]);
    dev.wait_for_line("Watching dags for changes");

    fs::write(
        dags.join("gamma.ts"),
        "export const marker = \"gamma\";\nexport default createDAG(\"gamma\");\n",
    )
    .unwrap();

    dev.wait_for_line("Rebundling gamma DAG");
    dev.wait_until(|| file_contains(&output_dir.join("gamma.js"), "gamma"));
    let (stdout, stderr) = dev.finish();

    assert!(stdout.contains("Rebundling gamma DAG"), "{stdout}");
    assert!(stderr.is_empty(), "{stderr}");

    fs::remove_dir_all(&cwd).unwrap();
}

#[test]
fn dev_ignores_changes_to_external_modules() {
    let cwd = temp_dir("dev-watch-external");
    let dags = cwd.join("dags");
    let external = cwd.join("node_modules/ext");
    fs::create_dir_all(&dags).unwrap();
    fs::create_dir_all(&external).unwrap();
    fs::write(
        external.join("index.js"),
        "export const marker = \"external-one\";\n",
    )
    .unwrap();
    fs::write(
        dags.join("alpha.ts"),
        "import { marker } from \"../node_modules/ext/index.js\";\nexport { marker };\nexport default createDAG(\"alpha\");\n",
    )
    .unwrap();

    let output_dir = cwd.join(".badag/output");
    let mut dev = DevProcess::spawn(&cwd, &["dev"]);
    dev.wait_for_line("Watching dags for changes");
    assert!(file_contains(&output_dir.join("alpha.js"), "external-one"));

    fs::write(
        external.join("index.js"),
        "export const marker = \"external-two\";\n",
    )
    .unwrap();
    thread::sleep(Duration::from_millis(300));

    let (stdout, stderr) = dev.finish();
    assert!(!stdout.contains("Rebundling"), "{stdout}");
    assert!(stderr.is_empty(), "{stderr}");
    assert!(file_contains(&output_dir.join("alpha.js"), "external-one"));

    fs::remove_dir_all(&cwd).unwrap();
}

#[cfg(unix)]
#[test]
fn dev_exits_cleanly_when_terminated() {
    for signal in ["INT", "TERM"] {
        let cwd = temp_dir(&format!("dev-signal-{signal}"));
        let dags = cwd.join("dags");
        fs::create_dir(&dags).unwrap();
        fs::write(
            dags.join("alpha.ts"),
            "export default createDAG(\"alpha\");\n",
        )
        .unwrap();

        let mut dev = DevProcess::spawn(&cwd, &["dev"]);
        dev.wait_for_line("Watching dags for changes");
        dev.terminate(signal);

        let status = dev.wait_for_exit();
        assert!(status.success(), "SIG{signal}: {status}");
        let (stdout, stderr) = dev.finish();
        assert_eq!(stdout, "Watching dags for changes\n", "SIG{signal}");
        assert!(stderr.is_empty(), "SIG{signal}: {stderr}");

        fs::remove_dir_all(&cwd).unwrap();
    }
}

#[test]
fn each_shell_gets_its_own_completion_script() {
    let expected = [
        ("bash", "complete -F _badag"),
        ("elvish", "set edit:completion:arg-completer[badag]"),
        ("fish", "complete -c badag"),
        ("nushell", "export extern badag"),
        (
            "powershell",
            "Register-ArgumentCompleter -Native -CommandName 'badag'",
        ),
        ("zsh", "#compdef badag"),
    ];

    for (shell, marker) in expected {
        let output = badag(&["completions", shell]);

        assert!(
            output.status.success(),
            "{shell}: generator exited with {}",
            output.status
        );
        let script = stdout_of(&output);
        assert!(script.contains(marker), "{shell}: script lacks {marker:?}");
    }
}

#[test]
fn unknown_shell_reports_supported_values_on_stderr() {
    let output = badag(&["completions", "tcsh"]);
    let stderr = stderr_of(&output);

    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty(), "no script may be written");
    assert!(stderr.contains("'tcsh'"), "{stderr}");
    assert!(
        stderr.contains("[possible values: bash, elvish, fish, nushell, powershell, zsh]"),
        "{stderr}"
    );
}
