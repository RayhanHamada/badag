use anyhow::{Context, Result};

#[cfg(unix)]
pub(super) struct Signals {
    interrupt: tokio::signal::unix::Signal,
    terminate: tokio::signal::unix::Signal,
}

#[cfg(unix)]
impl Signals {
    pub(super) fn new() -> Result<Self> {
        use tokio::signal::unix::{SignalKind, signal};

        Ok(Self {
            interrupt: signal(SignalKind::interrupt()).context("failed to listen for SIGINT")?,
            terminate: signal(SignalKind::terminate()).context("failed to listen for SIGTERM")?,
        })
    }

    pub(super) async fn wait(&mut self) -> Result<()> {
        tokio::select! {
            _ = self.interrupt.recv() => {}
            _ = self.terminate.recv() => {}
        }

        Ok(())
    }
}

#[cfg(not(unix))]
pub(super) struct Signals;

#[cfg(not(unix))]
impl Signals {
    pub(super) fn new() -> Result<Self> {
        Ok(Self)
    }

    pub(super) async fn wait(&mut self) -> Result<()> {
        tokio::signal::ctrl_c()
            .await
            .context("failed to listen for Ctrl-C")
    }
}
