# Badag

A TypeScript SDK for declaring task graphs, wiring dependencies, and validating their structure. Execution state belongs to a separate runtime.

## Language

**DAG**: A directed acyclic graph whose nodes are tasks and whose edges are execution dependencies. _Avoid_: workflow, pipeline

**DAG ID**: The identifier of a DAG, following Airflow's `dag_id` convention: letters, numbers, underscores, dots, and dashes only, at most 250 characters, with no whitespace. Unlike a task id, a DAG id is never trimmed, and a deviation is reported by `DAG.validate()` rather than rejected at construction. _Avoid_: DAG name, dagName, workflow id

**DAG metadata**: The optional, non-structural part of a DAG supplied at construction — currently a human-readable description. It is exposed as `dag.metadata` and serialized as `description` in `DAG.toJSON()`. _Avoid_: DAG config, DAG settings

**Task definition**: An id, behavior, and optional metadata declared before the task belongs to any DAG. _Avoid_: task spec, task template, unregistered task

**Task metadata**: The optional, non-behavioral part of a task definition — description, config, trigger rule, and kind-specific timing such as a polling interval. Metadata never affects task identity. _Avoid_: options, settings, attributes

**Behavior**: The part of a task definition that determines what it does: its callback for callback kinds, its declared fields for declarative kinds. Registration compares behavior when an id is reused; callback kinds compare function references, and metadata is ignored. _Avoid_: behavior source, body, implementation

**Payload**: The value a task receives, delivered in `ctx.payload` and typed by its input schema. Without an input schema the payload is `undefined`. _Avoid_: argument, params, data

**Input schema**: An optional Standard Schema declared on a task that types its payload. The SDK stores it but never validates the payload against it. _Avoid_: validator, parser, params schema

**Output schema**: An optional Standard Schema declared on a task that constrains the value the task produces. Kinds with a fixed result carry a default output schema, which is a type-level description only — the task declares no schema at runtime. _Avoid_: result schema, return type

**Produced value**: The value a task yields, typed by its output schema. Without one the value is `unknown`. _Avoid_: result, return value, output

**Task kind**: The category that determines how a task behaves and which kind-specific metadata it carries. _Avoid_: task type, operator

**Sensor task**: A task that polls a predicate until it returns true. _Avoid_: poller, watcher

**Delay task**: A task that waits for a fixed duration before completing. _Avoid_: sleep task, timer task

**Branch task**: A task that chooses one or more named branches for a scheduler to follow. _Avoid_: router, switch

**Declared branch**: A branch name listed in a branch task's `branches` set. A branch task stays unrouted until one wiring step routes it, and that single step must name exactly the declared branches — no missing name, no extra one. Routing cannot be assembled across steps. A branch task with no declared branches is unconstrained; a branch task declaring an empty set constrains nothing. _Avoid_: branch target, branch child, branch task

**Short-circuit task**: A task whose condition tells a scheduler whether downstream tasks should run. _Avoid_: gate, guard

**Trigger task**: A task that starts a different DAG, optionally waiting for it to finish. The target is a DAG id; a trigger task that targets the DAG containing it is a self trigger: valid to declare, impossible to execute. _Avoid_: child DAG task, launcher

**Registered task**: A task definition attached to a specific DAG, with its declared id and any dependency edges. _Avoid_: node, vertex, job

**Violation**: One problem found when auditing a graph, reported by `DAG.validate()` as a code, the values involved, and a message. A violation concerns values rather than only tasks: a branch finding names a declared branch, and a trigger finding names a DAG. Distinct from an error: the wiring methods throw errors, while a violation is returned. _Avoid_: error, issue, warning

**Graph audit**: A read-only pass over the registered tasks and their edges that returns violations instead of throwing. Stateless and non-destructive, so it is safe to run at any point in a DAG's life. _Avoid_: check, lint, verification

**Unrouted branch**: The violation for a declared branch the branch task does not route to. A branch task is unrouted until a single wiring step routes it to exactly its declared branches, so a freshly registered branch is expected to be unrouted. _Avoid_: missing branch, incomplete branch, dangling branch

**Task ID**: The declared identifier of a task, unique within its DAG. Factories trim surrounding whitespace and validate it against Airflow's `task_id` convention: letters, numbers, underscores, dots, and dashes only, at most 250 characters. A definition's id is the same wherever it is registered; registration never derives or rewrites it. _Avoid_: task name, label, slug, content hash, UUID

**Dependency edge**: A directed requirement that an upstream task finish before a downstream task becomes ready. Cycles are invalid. _Avoid_: link, connection

**Upstream task**: A task that must finish before a given task becomes ready. _Avoid_: parent, predecessor

**Downstream task**: A task that becomes ready only after a given task finishes. _Avoid_: child, successor

**Wiring set**: A set of tasks treated as one side of dependency wiring; every task in the set is wired to every task in the adjacent set, while membership in the same set implies no edge between its tasks. Wiring requires tasks on both sides. _Avoid_: task group, group, batch, stage

**Wiring expression**: One dependency statement written in bitshift notation, such as `a >> b >> c`; it names tasks and the operators between them, and produces dependency edges when a DAG parses it. _Avoid_: edge string, chain expression, flow statement

**Wiring notation**: The `>>` and `<<` syntax a wiring expression is written in, where `>>` points from the task on its left to the task on its right and `<<` points back. Operators evaluate left to right and each result is the left operand of the next. _Avoid_: bitshift syntax, Airflow syntax, arrow notation

**Operand**: One task or one wiring set inside a wiring expression. _Avoid_: argument, parameter, term

**Wiring step**: One validated edge between two wiring sets, derived from a wiring expression; `a >> b << c` yields two steps, `a -> b` and `c -> b`. _Avoid_: edge pair, link

**Completion**: A runtime fact that a task has finished executing, carrying no success, failure, or skip outcome by itself. The SDK stores no completion state. _Avoid_: done, terminal state

**Ready task**: A runtime decision that a task is eligible to run, derived from execution state, upstream outcomes, and its trigger rule. The SDK stores no readiness state. _Avoid_: runnable task, eligible task

**Trigger rule**: A declared condition under which a scheduler may run a task, expressed in terms of upstream outcomes; the DAG stores it but does not evaluate it. _Avoid_: readiness rule, run condition

**Duplicate definition**: A task definition whose id matches a task already registered in the same DAG and whose behavior also matches. Callback kinds compare callback references; declarative kinds compare the fields that determine what they do. Registering it reuses the existing registered task: the first registration's metadata is kept and the duplicate's metadata is discarded. A matching id with different behavior is rejected. _Avoid_: duplicate task, repeated task

**Task ID collision**: A task definition whose id matches a task already registered in the same DAG but whose behavior differs; registration is rejected. _Avoid_: duplicate ID, task name collision

**Duplicate declared branch**: The violation for a branch task that lists the same declared branch name more than once. A repeated name can only ever be routed to by one task, so the second listing states nothing. _Avoid_: repeated branch, duplicate branch

**Invalid DAG id**: The violation for a DAG id that does not follow Airflow's `dag_id` convention. Construction stores the id verbatim, so `DAG.validate()` reports it. _Avoid_: bad DAG id, malformed DAG id

**Invalid declared branch**: The violation for a declared branch name that could never be a task id, such as an empty or whitespace-only name. No wiring can satisfy it, so it is reported as invalid rather than as unrouted. _Avoid_: bad branch name, malformed branch

**Invalid task ID**: The violation for a registered task whose id does not follow Airflow's `task_id` convention. Registration rejects such ids, so the finding only appears for graphs restored or assembled outside the public methods. _Avoid_: bad task id, malformed task id

**Self trigger**: The violation for a trigger task whose target is the DAG that contains it. The declaration is legal, but running it would start a second copy of the same graph, so no scheduler can execute it. _Avoid_: recursive trigger, trigger loop
