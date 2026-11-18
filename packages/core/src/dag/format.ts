/** Render values for an error message. */
export function quoteValues(values: readonly string[]): string {
    return values.map((value) => `"${value}"`).join(", ");
}
