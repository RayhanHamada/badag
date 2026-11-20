# Badag

A TypeScript SDK for declaring task graphs through dialects, wiring dependencies, and validating their structure. Execution state belongs to a separate runtime.

## Graph model

**DAG**: A directed acyclic graph whose nodes execute work and whose edges are execution dependencies. A DAG definition is data; it does not execute. _Avoid_: workflow, pipeline

**DAG ID**: The identifier of a DAG. The graph layer requires only a non-empty key; the Airflow convention applies in the dialect. _Avoid_: DAG name, dagName, workflow id

**DAG metadata**: The optional, non-structural part of a DAG — currently a human-readable description. _Avoid_: DAG config, DAG settings

**Graph spec**: The pure-data, versioned description of a graph: spec version, DAG id, revision, nodes, and labeled edges. It is what persists and what a runtime replays. _Avoid_: snapshot, JSON dump, config

**Spec version**: The version of the graph spec's shape, so a stored spec can be migrated rather than guessed at. _Avoid_: schema version, format version

**Revision**: The content identity of one immutable graph definition, derived from its nodes and edges. Historical runs reference a revision. _Avoid_: version, build, snapshot

**Node**: One unit in a graph, identified by its key. A node is data in the spec; what it does lives in an implementation. _Avoid_: vertex, step, job

**Node key**: The declared identifier of a node, unique within its graph. Nothing derives or rewrites it, and it is the join between a spec and an implementation. _Avoid_: id, name, slug, content hash, UUID

**Node type**: The open discriminator a node's config is interpreted under, stored as data. _Avoid_: kind, operator

**Node config**: The JSON object stored on a node in the spec. It carries the node's role, description, activation policy, retry count, and preset-specific keys; the graph layer never interprets it. _Avoid_: node options, settings, metadata

**Node description**: An optional human-readable label carried in node config. It is never identity and never a dependency reference. _Avoid_: name, title, alias, display label

**Node role**: What a node contributes at execution — compute, router, or waiter. A preset is a named configuration of one role. _Avoid_: task kind, task type, operator

**Compute node**: A node that executes work and produces a value. _Avoid_: regular task, operator

**Router node**: A node that selects route labels. It decides what runs and produces no business value of its own. _Avoid_: branch task, branch operator, switch

**Waiter node**: A node that suspends until a predicate, a timer, or an external event resumes it. _Avoid_: sensor, delay, poller

**Edge**: A directed requirement that an upstream node finish before a downstream node becomes ready. An edge may carry one route label. Cycles are invalid. _Avoid_: link, connection, dependency arrow

**Route label**: The string an edge carries so a router's selection can activate it. An edge out of a router defaults to the target node's key; every other edge is unlabeled unless overridden. Labels are data; the graph layer never interprets them. _Avoid_: branch name, edge condition

**Activation policy**: The rule a node evaluates over its route-active incoming edges to decide whether it runs, is skipped, or waits. _Avoid_: trigger rule (reserved for the Airflow preset), join rule

**Implementation**: The code registered for a node key — the callable and any schema it declares. Implementations are build-local and never part of the spec. _Avoid_: behavior, handler, executor, function

**Finding**: One problem reported by a check, carrying a code, the values involved, and a message. Structural findings come from the graph layer; dialect findings are composed by the caller. Distinct from an error: wiring throws, a check reports. _Avoid_: violation, error, issue, warning

**Graph check**: A read-only pass over a spec that returns findings instead of throwing. It is a pure function of the spec, so a graph loaded from storage and one built in memory cross the same seam. _Avoid_: validation, audit, lint, verification

## Dialects

**Dialect**: An authoring vocabulary and syntax that compiles to the graph spec. It owns presets, notation, key conventions, and dialect findings; the graph layer never interprets it, and the runtime sees only the shared node config contract. _Avoid_: adapter, flavor, frontend

**Preset**: A named authoring form in a dialect that fixes one node type and role and produces a node definition. _Avoid_: task kind, operator, template

**Node options**: The authoring inputs a preset accepts — description, extra config, activation policy, schemas, and preset-specific fields. They become node config and implementation; they are not stored as a unit. _Avoid_: task metadata, settings, attributes

**Preset config**: The part of node config a preset exposes — the keys it makes available and what they mean. It belongs to the preset, not the graph layer. _Avoid_: node options, settings

**Dialect finding**: A finding produced by a dialect's check beyond the graph layer's structural findings. _Avoid_: validation error, warning

## Airflow dialect

The first Badag dialect.

**Task definition**: The dialect's authoring form of a compute node: a key, an implementation, and optional node options declared before the node belongs to any DAG. _Avoid_: task spec, task template, unregistered task

**Payload**: The value a task receives, typed by its input schema. Without an input schema the payload is `undefined`. _Avoid_: argument, params, data

**Input schema**: An optional Standard Schema declared on an implementation that types its payload. It is stored but never applied by the SDK. _Avoid_: validator, parser, params schema

**Output schema**: An optional Standard Schema declared on an implementation that constrains the value the node produces. A fixed-result preset describes its produced value at the type level without declaring a runtime schema. _Avoid_: result schema, return type

**Produced value**: The value a node yields, typed by its output schema. Without one the value is `unknown`. _Avoid_: result, return value, output

**Sensor task**: An Airflow preset of a waiter node that polls a predicate until it returns true. _Avoid_: poller, watcher

**Delay task**: An Airflow preset of a waiter node that waits for a fixed duration before completing. _Avoid_: sleep task, timer task

**Branch task**: An Airflow preset of a router node that chooses one or more route labels. _Avoid_: branch operator, switch

**Declared branch**: A route label listed in a branch preset's declared set. Every declared label must have an outgoing edge from the branch, and no outgoing edge from the branch may carry an undeclared label. A branch preset that declares nothing is unconstrained. By default an edge's label is the target node's key; an override pairs a different label with that node. _Avoid_: branch target, branch child

**Label override**: A routed operand that pairs a route label with a node, so the edge carries a label other than the target's key. It exists so a route name never has to dictate a node's identity. _Avoid_: named edge, alias, renamed branch

**Short-circuit task**: An Airflow preset of a router node with two labels, run and skip. _Avoid_: gate, guard

**Trigger task**: An Airflow preset of a compute node that starts a different DAG and may suspend on the run it started. The target is a DAG id; a trigger that targets its own DAG is a self trigger: valid to declare, impossible to execute. _Avoid_: child DAG task, launcher

**Trigger rule**: An Airflow name for an activation policy, expressed in terms of upstream outcomes. The dialect stores the name; the runtime evaluates it. _Avoid_: readiness rule, run condition

**Wiring set**: A set of nodes treated as one side of dependency wiring; every node in the set is wired to every node in the adjacent set, while membership in the same set implies no edge between its nodes. Wiring requires nodes on both sides. _Avoid_: task group, group, batch, stage

**Wiring expression**: One dependency statement written in bitshift notation, such as `a >> b >> c`; it names nodes and the operators between them, and produces edges when the dialect parses it. _Avoid_: edge string, chain expression, flow statement

**Wiring notation**: The `>>` and `<<` syntax a wiring expression is written in, where `>>` points from the node on its left to the node on its right and `<<` points back. Operators evaluate left to right and each result is the left operand of the next. _Avoid_: bitshift syntax, Airflow syntax, arrow notation

**Operand**: One node or one wiring set inside a wiring expression. _Avoid_: argument, parameter, term

**Wiring step**: One validated edge between two wiring sets, derived from a wiring expression; `a >> b << c` yields two steps, `a -> b` and `c -> b`. _Avoid_: edge pair, link

**Airflow key convention**: The `validate_key` rule the dialect applies to DAG ids and task ids: Unicode letters and numbers, underscore, dot, and dash only, at most 250 characters, with no whitespace. _Avoid_: id rule, naming rule

**Duplicate declared branch**: The dialect finding for a branch preset that lists the same route label more than once. A repeated label activates the same edges, so the second listing states nothing. _Avoid_: repeated branch, duplicate branch

**Unrouted branch**: The dialect finding for a declared branch with no outgoing labeled edge. A branch preset that declares nothing is unconstrained, so it is never unrouted. _Avoid_: missing branch, incomplete branch, dangling branch

**Invalid declared branch**: The dialect finding for a declared branch that could never be a node key, such as an empty or whitespace-only label. _Avoid_: bad branch name, malformed branch

**Invalid node key**: The dialect finding for a node key that does not follow the Airflow key convention. _Avoid_: bad task id, malformed task id

**Invalid DAG id**: The dialect finding for a DAG id that does not follow the Airflow key convention. _Avoid_: bad DAG id, malformed DAG id

**Self trigger**: The dialect finding for a trigger preset whose target is the DAG that contains it. The declaration is legal, but running it would start a second copy of the same graph, so no scheduler can execute it. _Avoid_: recursive trigger, trigger loop

## Execution

**Run**: One execution of one immutable graph revision. _Avoid_: job, attempt

**Attempt**: One try at executing a node. A retry creates a new attempt; it does not change an outcome into a different one. _Avoid_: retry, execution

**Outcome**: The terminal result of one attempt — succeeded, failed, skipped, or cancelled. It is not a scheduling state. _Avoid_: status, state

**Completion**: A runtime fact that a node has finished executing, carrying no outcome by itself. The SDK stores no completion state. _Avoid_: done, terminal state

**Ready node**: A runtime decision that a node is eligible to run, derived from execution state, upstream outcomes, and its activation policy. The SDK stores no readiness state. _Avoid_: runnable task, eligible task

**Active route**: The set of route labels a router selected and the runtime is carrying toward downstream nodes. An edge is route-active when it is unlabeled or its label is active; activity survives a skipped upstream. A node with no route-active incoming edge is skipped. _Avoid_: branch selection, chosen path

**Scope**: A runtime instantiation of part of a graph, used for mapping and loops. Iterations and fan-out are execution structure, not edges in the definition. _Avoid_: subgraph, task group
