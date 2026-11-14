use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow, bail};
use oxc_allocator::Allocator;
use oxc_ast::ast::{Argument, CallExpression, Expression, Program, Statement};
use oxc_parser::Parser;
use oxc_span::SourceType;

use super::ast::{find_declarator, unwrap_expression};

pub(super) fn emit(output_dir: &Path, files: &[PathBuf]) -> Result<()> {
    for path in files {
        emit_one(output_dir, path)?;
    }

    Ok(())
}

pub(super) fn emit_one(output_dir: &Path, path: &Path) -> Result<()> {
    let source_type = SourceType::from_path(path)
        .map_err(|error| anyhow!("{}: unsupported file type: {error}", path.display()))?;
    let source =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &source, source_type).parse();

    if !parsed.diagnostics.is_empty() {
        bail!("failed to parse {} while generating types", path.display());
    }

    let dag_type = match default_export_dag_name(&parsed.program) {
        Some(name) => format!("ReturnType<typeof createDAG<{name}>>"),
        None => "ReturnType<typeof createDAG>".to_owned(),
    };
    let declaration = format!(
        "import type {{ createDAG }} from \"@badag/sdk\";\n\ndeclare const dag: {dag_type};\nexport default dag;\n"
    );

    let name = path
        .file_stem()
        .and_then(OsStr::to_str)
        .with_context(|| format!("invalid DAG file name: {}", path.display()))?;
    let declaration_path = output_dir.join(format!("{name}.d.ts"));
    fs::write(&declaration_path, declaration)
        .with_context(|| format!("failed to write {}", declaration_path.display()))?;

    Ok(())
}

fn default_export_dag_name(program: &Program<'_>) -> Option<String> {
    for statement in &program.body {
        match statement {
            Statement::ExportDefaultDeclaration(export) => {
                return export
                    .declaration
                    .as_expression()
                    .and_then(|expression| expression_dag_name(program, expression));
            }
            Statement::ExportNamedDeclaration(export) => {
                for specifier in &export.specifiers {
                    if specifier.exported.name() == "default" {
                        return specifier
                            .local
                            .identifier_name()
                            .and_then(|name| declared_dag_name(program, name.as_str()));
                    }
                }
            }
            _ => {}
        }
    }

    None
}

fn expression_dag_name(program: &Program<'_>, expression: &Expression<'_>) -> Option<String> {
    match unwrap_expression(expression) {
        Expression::Identifier(identifier) => declared_dag_name(program, identifier.name.as_str()),
        expression => create_dag_name(expression),
    }
}

fn declared_dag_name(program: &Program<'_>, name: &str) -> Option<String> {
    let init = find_declarator(program, name)?.init.as_ref()?;
    create_dag_name(init)
}

fn create_dag_name(expression: &Expression<'_>) -> Option<String> {
    let Expression::CallExpression(call) = unwrap_expression(expression) else {
        return None;
    };

    match unwrap_expression(&call.callee) {
        Expression::Identifier(identifier) if identifier.name == "createDAG" => {
            create_dag_call_name(call)
        }
        Expression::StaticMemberExpression(member) if member.property.name == "createDAG" => {
            create_dag_call_name(call)
        }
        Expression::StaticMemberExpression(member) => create_dag_name(&member.object),
        _ => None,
    }
}

fn create_dag_call_name(call: &CallExpression<'_>) -> Option<String> {
    let Argument::StringLiteral(literal) = call.arguments.first()? else {
        return None;
    };
    literal.raw.as_ref().map(|raw| raw.as_str().to_owned())
}

#[cfg(test)]
mod tests {
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    use super::default_export_dag_name;

    fn default_dag_name(source: &str) -> Option<String> {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::ts()).parse();
        assert!(parsed.diagnostics.is_empty());
        default_export_dag_name(&parsed.program)
    }

    #[test]
    fn reads_the_dag_name_from_the_default_export() {
        for (source, expected) in [
            (
                "export default createDAG(\"direct\");\n",
                Some("\"direct\""),
            ),
            (
                "const dag = createDAG(\"named\");\nexport default dag;\n",
                Some("\"named\""),
            ),
            (
                "const dag = createDAG(\"chained\").chain();\nexport default dag;\n",
                Some("\"chained\""),
            ),
            (
                "const dag = createDAG(\"aliased\");\nexport { dag as default };\n",
                Some("\"aliased\""),
            ),
            (
                "import * as sdk from \"@badag/sdk\";\nexport default sdk.createDAG(\"namespaced\");\n",
                Some("\"namespaced\""),
            ),
            ("export default createDAG(\"a>b\");\n", Some("\"a>b\"")),
            ("const dag = makeDag();\nexport default dag;\n", None),
        ] {
            assert_eq!(default_dag_name(source).as_deref(), expected, "{source}");
        }
    }
}
