/**
 * Task ids: Airflow's `task_id` convention plus the literal type of a trimmed
 * id.
 */

import { keyError } from "../airflow-key";

/** Whitespace trimmed from a task id by the factories. */
type TaskIdWhitespace =
    | " "
    | "\n"
    | "\t"
    | "\r"
    | "\f"
    | "\v"
    | "\u00A0"
    | "\u1680"
    | "\u2000"
    | "\u2001"
    | "\u2002"
    | "\u2003"
    | "\u2004"
    | "\u2005"
    | "\u2006"
    | "\u2007"
    | "\u2008"
    | "\u2009"
    | "\u200A"
    | "\u2028"
    | "\u2029"
    | "\u202F"
    | "\u205F"
    | "\u3000"
    | "\uFEFF";

type TrimTaskIdEnd<Id extends string> =
    Id extends `${infer Rest}${TaskIdWhitespace}` ? TrimTaskIdEnd<Rest> : Id;

type TrimTaskIdStart<Id extends string> =
    Id extends `${TaskIdWhitespace}${infer Rest}` ? TrimTaskIdStart<Rest> : Id;

/** The task id after a factory trims surrounding whitespace. */
export type TrimTaskId<Id extends string> = TrimTaskIdStart<TrimTaskIdEnd<Id>>;

/** The problem with a task id, or `undefined` if valid. */
export function taskIdError(id: string): string | undefined {
    return keyError("Task ID", id);
}

/** Whether an id follows Airflow's task id convention. */
export function isTaskId(id: string): boolean {
    return taskIdError(id) === undefined;
}

/** Validate a task id. */
export function assertTaskId(id: string): void {
    const error = taskIdError(id);

    if (error !== undefined) {
        throw new Error(error);
    }
}

/**
 * Trim surrounding whitespace and validate a task id.
 *
 * The trimmed id follows Airflow's `task_id` convention: Unicode letters and
 * numbers, underscores, dots, and dashes, at most 250 characters.
 */
export function normalizeTaskId<Id extends string>(id: Id): TrimTaskId<Id> {
    const trimmed = id.trim();

    assertTaskId(trimmed);

    // SAFETY: trim() removes the whitespace represented by TrimTaskId.
    return trimmed as TrimTaskId<Id>;
}
