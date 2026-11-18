use oxc_ast::ast::{
    BindingPattern, Declaration, Expression, Program, Statement, VariableDeclarator,
};

pub(super) fn find_declarator<'a, 'b>(
    program: &'b Program<'a>,
    name: &str,
) -> Option<&'b VariableDeclarator<'a>> {
    for statement in &program.body {
        let declaration = match statement {
            Statement::VariableDeclaration(declaration) => Some(declaration),
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::VariableDeclaration(declaration) => Some(declaration),
                _ => None,
            },
            _ => None,
        };

        let Some(declaration) = declaration else {
            continue;
        };

        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
                continue;
            };

            if identifier.name == name {
                return Some(declarator);
            }
        }
    }

    None
}

pub(super) fn unwrap_expression<'a, 'b>(expression: &'b Expression<'a>) -> &'b Expression<'a> {
    match expression {
        Expression::ParenthesizedExpression(inner) => unwrap_expression(&inner.expression),
        Expression::TSAsExpression(inner) => unwrap_expression(&inner.expression),
        Expression::TSSatisfiesExpression(inner) => unwrap_expression(&inner.expression),
        Expression::TSNonNullExpression(inner) => unwrap_expression(&inner.expression),
        _ => expression,
    }
}
