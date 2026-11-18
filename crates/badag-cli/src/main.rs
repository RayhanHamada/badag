mod commands;

use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

use crate::commands::completions::Shell;

const BIN_NAME: &str = "badag";

#[derive(Debug, Parser)]
#[command(name = BIN_NAME, version, about = "Command-line interface for Badag")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Bundle DAG modules into one script per DAG
    Dev {
        /// Also emit TypeScript declarations
        #[arg(short = 't', long)]
        types: bool,

        /// Directory containing DAG modules
        #[arg(long, value_name = "DIR", default_value = "dags")]
        input: PathBuf,
    },

    /// Print a shell completion script to stdout
    #[command(after_long_help = commands::completions::HELP)]
    Completions {
        /// Shell to generate the script for
        #[arg(value_enum)]
        shell: Shell,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Dev { types, input } => commands::dev::run(types, &input).await?,
        Command::Completions { shell } => commands::completions::print(shell),
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use clap::CommandFactory;

    use super::Cli;

    #[test]
    fn cli_definition_is_valid() {
        Cli::command().debug_assert();
    }
}
