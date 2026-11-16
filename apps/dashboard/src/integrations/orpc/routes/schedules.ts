import * as v from "valibot";

import { base } from "../base";
import { NOT_FOUND_ERROR_MAP, NOT_IMPLEMENTED_ERROR_MAP } from "../errors";
import {
    scheduleIdParamsSchema,
    scheduleListQuerySchema,
    scheduleListSchema,
    scheduleSchema,
    upsertScheduleBodySchema,
} from "../models";
import { notImplemented } from "../shared";

export const schedulesRouter = {
    list: base
        .route({
            method: "GET",
            path: "/schedules",
            tags: ["Schedules"],
            summary: "List schedules",
            description:
                "Returns DAG schedules, optionally filtered by DAG or enabled state.",
            successDescription: "Schedule list.",
        })
        .input(scheduleListQuerySchema)
        .output(scheduleListSchema)
        .errors(NOT_IMPLEMENTED_ERROR_MAP)
        .handler(notImplemented),

    get: base
        .route({
            method: "GET",
            path: "/schedules/{scheduleId}",
            tags: ["Schedules"],
            summary: "Get a schedule",
            description: "Returns one schedule and its cron configuration.",
            successDescription: "Schedule.",
        })
        .input(scheduleIdParamsSchema)
        .output(scheduleSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP })
        .handler(notImplemented),

    upsert: base
        .route({
            method: "PUT",
            path: "/schedules/{scheduleId}",
            tags: ["Schedules"],
            summary: "Create or replace a schedule",
            description:
                "Upserts the cron expression, timezone, and enabled state for a schedule.",
            successDescription: "Schedule upserted.",
        })
        .input(
            v.object({
                ...scheduleIdParamsSchema.entries,
                ...upsertScheduleBodySchema.entries,
            })
        )
        .output(scheduleSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP })
        .handler(notImplemented),

    delete: base
        .route({
            method: "DELETE",
            path: "/schedules/{scheduleId}",
            tags: ["Schedules"],
            summary: "Delete a schedule",
            description: "Removes a schedule. Existing runs are unaffected.",
            successStatus: 204,
            successDescription: "Schedule deleted.",
        })
        .input(scheduleIdParamsSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP })
        .handler(notImplemented),
};
