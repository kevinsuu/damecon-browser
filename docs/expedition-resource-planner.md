# Expedition Recommendation Planner

The planner is an independent **遠征推薦** item in KC3Kai's Strategy Room expedition menu. It shows
the current account resources and returns one best expedition set from the selected resource
preference settings, with an explicit second-to-fourth fleet assignment. The original **Expedition
Scorer** page and its controls are left unchanged.

The feature is advisory. It does not click the game, change a fleet, resupply ships, start an
expedition, or collect expedition rewards.

The menu item, controls, validation, planner states, requirements, and result explanations follow
KC3's configured language. English (`en`), Traditional Chinese (`tcn`), Simplified Chinese (`scn`),
and Japanese (`jp`) are supported; unsupported language codes fall back to English. Reopen or
reload Strategy Room after changing KC3's language. Expedition names are read from KC3 master data
and therefore keep the name supplied by KC3.

## Account synchronization

The current fuel, ammunition, steel, and bauxite values come from
`PlayerManager.hq.lastMaterial` in the loaded KC3 Strategy Room. Before reading them, the planner
calls `PlayerManager.hq.load()` so the Strategy Room tab reloads KC3's latest locally saved resource
state instead of retaining its older in-memory copy. This happens when **遠征推薦** opens, when
**同步資源** is pressed, and before a plan is generated. The sync timestamp and the account
resource cap are available from the **同步資源** button tooltip in the recommendation-page title
bar. The four resource cards show the latest synchronized values directly; there is no separate
synchronization header panel.

The sync button visibly changes through **同步中…** and **同步完成** even when the synchronized
values are unchanged, then returns to its normal action label. A failed sync keeps the failure label
and exposes the error in the button tooltip.

The resource cards are the first planning section below the page introduction and show only the
latest synchronized fuel, ammunition, steel, and bauxite values.

KC3 updates these values from game API traffic. If they are unavailable, the UI asks the user to
return to the home port before synchronizing again. The planner does not poll the game API itself.

## Planning inputs

The recommendation page owns its planning controls so changing them does not affect Expedition
Scorer:

- checked expeditions in worlds 1–5 are the candidate pool;
- **資源取得設定** assigns each resource to optimize, at-least-break-even, or ignored mode.
  Optimized resources have a unique, continuous priority order; break-even resources require
  non-negative hourly net yield; ignored resources do not affect ranking;
- **派遣／收取間隔** supplies the repeated operation interval and selects one, two, or three
  expedition fleets;
- **成功模式** selects normal or great success;
- **大發系裝備** selects zero to four Daihatsu-type equipment items per fleet and displays the
  combined income multiplier, up to 1.8×.

Resource modes and priorities, the collection interval, fleet count, success mode, and Daihatsu
count are saved locally when changed. Reopening the game or switching away from the Strategy Room
page restores the last valid settings. Candidate expedition checkboxes remain independent and
continue to default to all selected. Invalid, incompatible, or unavailable browser storage falls
back to the documented defaults without preventing the planner from opening.

The preference controls default to optimizing buckets, fuel, bauxite, ammunition, then steel.
Changing a rank automatically reorders the other optimized resources so enabled ranks stay unique
and continuous. Break-even resources currently use `minimumNetYieldPerHour = 0` and are reserved for
future configurable minimums. Break-even and ignored resources do not participate in ranking.

The selected success mode and Daihatsu count are applied uniformly to every candidate. Normal
success has a factor of 1.0, great success has a factor of 1.5, and each Daihatsu-type item adds 5%
up to four items (20%):

After the inputs pass validation, **產生最佳配對** changes to a disabled loading state with a
route-calculation indicator while the planner runs. The normal label and enabled state are restored
after either a result or a handled connection error.

```text
success factor = great success ? 1.5 : 1.0
Daihatsu factor = 1 + Daihatsu count × 0.05
gross resource income = floor(base resource income × success factor × Daihatsu factor)
net fuel/ammunition = gross income - Kancepts-style estimated resupply cost
```

Great success with four Daihatsu-type items produces the displayed maximum multiplier of
`1.5 × 1.2 = 1.8`. Great success is treated as occurring on every return when selected; it is not a
probability estimate. The UI therefore also shows KC3's great-success guidance for the selected
expedition. Daihatsu count is a planning assumption: the feature does not inspect or change fleet
equipment, so the user must verify the selected count before dispatch.

Resupply cost follows the Kancepts cost-model method with the currently synchronized KC3 ship
roster:

- use Kancepts' minimum fleet composition for each expedition;
- fill unspecified ships with destroyers, matching Kancepts' default wildcard;
- apply the expedition's fuel and ammunition consumption percentages to each eligible ship;
- apply the level-100 marriage reduction after the percentage and floor operations;
- sort eligible ships by combined fuel and ammunition cost, discard duplicate master ship IDs,
  and take the cheapest required count for each ship-type group.

This makes the result comparable with Kancepts when Kancepts has imported the same ship roster and
uses its default cost configuration. Kancepts also permits a separate stored ship list and custom
per-expedition wildcard, ship-count, or fixed-cost settings. Results cannot be numerically identical
when those inputs differ; the planner displays its estimated fuel and ammunition cost on every
recommended expedition so the differing input can be identified.

Generating a plan reads a new KC3 snapshot and immediately replaces the displayed current resources,
update time, and resource limit with the values used by that calculation. The cards cannot continue
showing an older manual-sync snapshot beside a newly calculated recommendation.

For every candidate set, the planner calculates net hourly income after the configured estimated
resupply cost. When the operation interval is zero, each expedition uses its actual duration, which
models a continuously online user. With a non-zero interval, the effective cycle is the first
operation boundary at or after the expedition returns:

```text
effective cycle = ceil(expedition duration / operation interval) × operation interval
```

For example, when results are collected once per hour, a 90-minute expedition occupies two hours
and a 140-minute expedition occupies three hours. This prevents an expedition from being credited
before the user can actually collect and redispatch it.

All candidate sets use the same comparison horizon: one hour for online mode or the configured
operation interval otherwise. This prevents a long expedition from enlarging only its own comparison
window and artificially increasing the projected income of the other fleets in that set.

The planner does not rank by raw resource amount multiplied by the sliders, and it does not add
independent expedition scores. It first enumerates complete candidate sets for the selected fleet
count. For each set, it sums the steady-state hourly fuel, ammunition, steel, bauxite, and bucket
values after the success/Daihatsu income multiplier, effective collection interval, and estimated
resupply cost.

After every candidate set has been built, the planner calculates the best reachable complete-set
benchmark for each resource:

```text
maxFuelPerHour = max(candidate set fuel/hour)
maxAmmoPerHour = max(candidate set ammunition/hour)
maxSteelPerHour = max(candidate set steel/hour)
maxBauxitePerHour = max(candidate set bauxite/hour)
maxBucketPerHour = max(candidate set bucket/hour)
```

Each candidate set is converted into resource satisfaction against those per-resource benchmarks. A
zero or negative benchmark means that objective cannot be positively optimized in the current
candidate pool, so that satisfaction is treated as zero and never produces `NaN` or infinity.
Negative net yield is preserved when the benchmark is positive, then clamped into `[-1, 1]` so a
fuel-losing expedition set is worse than a zero-fuel set without letting an extreme value dominate:

```text
satisfactionFuel = clamp(fuelPerHour / maxFuelPerHour, -1, 1)
satisfactionAmmo = clamp(ammoPerHour / maxAmmoPerHour, -1, 1)
satisfactionSteel = clamp(steelPerHour / maxSteelPerHour, -1, 1)
satisfactionBauxite = clamp(bauxitePerHour / maxBauxitePerHour, -1, 1)
satisfactionBucket = clamp(bucketPerHour / maxBucketPerHour, -1, 1)
```

Satisfaction then goes through a concave diminishing-return utility:

```text
resourceUtility(s) = 1 - (1 - s)^2
                   = 2s - s^2
```

This rewards moving an important resource from starvation toward a reasonable share of its reachable
best more strongly than squeezing the final few percentage points out of another resource. For
example, a set with fuel satisfaction `0` and bauxite satisfaction `1` is less attractive than a set
that reaches about `0.7` for both when fuel and bauxite have equal high weights.

The user-facing preferences are applied before the existing normalized scoring pipeline runs:

```text
enumerate combinations
calculate expected NET yield
apply resource constraints
remove infeasible combinations
Pareto pruning over optimized resources
calculate benchmarks for optimized resources
satisfaction
resourceUtility
priority weights
final combination score
```

Optimized resources convert their priority rank into internal weights:

```text
rank 1 = 100
rank 2 = 70
rank 3 = 45
rank 4 = 25
rank 5 = 10
constraint = 0
ignored = 0
```

Those internal weights are normalized before scoring:

```text
normalizedWeight = resourceWeight / sum(abs(all non-zero resource and bucket weights))
score = sum(normalizedWeight × resourceUtility(satisfaction))
```

This makes optimized resources comparable despite their unlike raw units. A higher rank means the
optimizer gives that resource efficiency more importance relative to its own reachable best value;
it does not require the final resource amounts to follow the same ratio. Constraint resources are
hard feasibility checks only: once a plan satisfies the minimum, extra yield contributes exactly
zero to the score, benchmark, satisfaction, utility, and Pareto objective scope. Ignored resources
also contribute exactly zero whether their yield is positive, zero, or negative. If priority mode has
no optimized resources, utility scores remain zero instead of falling back to hidden resource
weights.

If two utility scores are effectively equal, deterministic tie-breakers are used in this order:
weighted expected net hourly yield, fewer negative-yield resources, lower estimated resupply cost,
then expedition ID order.

## Optimization debug log

The production planner does not print optimization logs by default. In a development console, enable
the expedition optimizer report before pressing **產生最佳配對**:

```js
KancolleOptimizerDebug.enable()
```

The next run sends `debug: true` with the planner request and prints prefixed console output such as:

```text
[KancolleOptimizer] Context
[KancolleOptimizer] Benchmarks
[KancolleOptimizer] Pareto Statistics
[KancolleOptimizer] Top 10
[KancolleOptimizer] Rank #1 Breakdown 02 + 05 + 38
[KancolleOptimizer] Rank #2 Breakdown A2 + 05 + 38
[KancolleOptimizer] Rank #3 Breakdown 02 + A2 + 38
[KancolleOptimizer] Compare 02+05+38 vs A2+05+38
[KancolleOptimizer] Bucket Debug
[KancolleOptimizer] FULL_SCORE_DEBUG
[KancolleOptimizer] Why Rank #1 won
```

The report avoids relying only on Chrome's expandable object references. It prints flattened
`console.table` views and a final copyable `JSON.stringify(..., null, 2)` block named
`FULL_SCORE_DEBUG`. The JSON block contains the scoring context, preferences, normalized weights,
optimize-scope resource benchmarks with the combination that produced each benchmark, constraint
rejections, Pareto pruning statistics, the watched combinations, Top 10 score rows, and bucket debug
rows. In priority mode, the context includes `preferenceMode: "priority"`, the full `preferences`
map, and a `priorityOrder` array with each resource's mode, UI rank, internal weight, configured
minimum, and normalized weight.

The main-process IPC logger also avoids nested inspect output. Its
`expedition-planner.completed` event keeps only flattened scoring summary rows. Complete copyable
JSON is emitted separately as `expedition-planner.completed.scoring-json`; when debug mode is
enabled and the worker returns the full report, `expedition-planner.completed.optimization-debug-json`
contains the complete optimization debug payload.

Pareto statistics use explicit names:

```text
totalCombinationCount = combinations before Pareto pruning
paretoRemovedCount = combinations removed by Pareto pruning
remainingCombinationCount = combinations scored after Pareto pruning
```

The watched-combination table always checks these sets when present in the candidate pool:

```text
02 + 05 + 38
A2 + 05 + 38
02 + A2 + 38
05 + A2 + B1
02 + A2 + B1
```

The bucket debug table always attempts to show these expedition IDs when their data is available in
the ranked or watched debug combinations:

```text
02
04
09
A2
B1
41
```

The requested-combination summary table prints `Fuel/h`, `Ammo/h`, `Steel/h`, `Bauxite/h`,
`Bucket/h`, `Fuel Satisfaction`, `Bucket Satisfaction`, `Fuel Contribution`, `Bucket Contribution`,
and `Total Score` for those watched combinations.

For each watched set, the log shows whether it existed before pruning, whether it was Pareto
dominated, whether it remained after pruning, and the first combination found to dominate it.

The structured report includes the actual context used by scoring, normalized weights, complete-set
resource benchmarks with the best combination for each resource, a Top 10 table, and detailed Rank
1-5 breakdowns. Each detailed combination lists net yield per hour, benchmark, satisfaction, utility,
raw weight, normalized weight, score contribution, and contribution ratio for fuel, ammunition,
steel, bauxite, and buckets. The sum of resource contributions is checked against the total utility
score with a small floating-point tolerance.

For each detailed combination, every expedition also logs its per-run calculation:

- base resource reward;
- reward after the success multiplier;
- reward after the Daihatsu multiplier as actually used by the planner;
- bucket item value used by the current item-reward engine;
- estimated fuel and ammunition resupply cost;
- net reward per run and expected net per hour.

After a debug run, compare any two combinations that were part of the scored candidate set:

```js
compareOptimizationCombinations(['02', '05', '38'], ['A2', '05', '38'])
```

The comparison table is based on score contribution differences rather than raw yield alone, so its
main reasons match the ranking model. Debug mode also automatically compares the current winner
against `A2 + 05 + 38`, `02 + A2 + 38`, `05 + A2 + B1`, and `02 + A2 + B1`, and also prints the
fixed `02 + 05 + 38` baseline against the same challengers when that baseline is not already the winner.
Those comparisons are printed when the combinations are available in the ranked or watched debug
data. Disable logging with:

```js
KancolleOptimizerDebug.disable()
```

Bucket rewards come from KC3's expedition master-data item slots. Since that data supplies the item
count but not a drop probability, the planner converts bucket items into an expected value before
scoring. A single item reward, and the left item when two rewards are shown, remains random on both
normal success and Great Success. When no explicit probability is available, a `0..1` bucket reward
is treated as `0.5` expected buckets per run. The right item in a two-item reward is expected only on
Great Success: `max` per run when Great Success is selected and `0` on normal success. Great Success
and Daihatsu multipliers never multiply item rewards.

## Fleet pairing and conditions

The planner evaluates the actual second, third, and fourth fleets with KC3's expedition requirement
engine, then selects the fleet-to-expedition permutation with the best current fit. Every pairing
shows:

- whether the fleet is currently free, supplied, and condition-compliant;
- the expedition duration, net income per return, and effective income per hour;
- required and current flagship level and type;
- required and current ship count, fleet total level, and ship-type counts;
- required and current ASW, LoS, anti-air, firepower, and torpedo totals when applicable;
- required and current drum count and number of drum carriers;
- the KC3 sample minimum composition when master data provides one;
- the current expedition and return time when the assigned fleet is busy, explicitly separated
  from the expedition recommended for dispatch after its return;
- the selected success/Daihatsu income multiplier, estimated resupply cost, and great-success
  guidance.

The result starts with a large dispatch board such as `第 3 艦隊 → 03 警備任務`, so destination
and fleet assignment appear immediately. Above those assignments, a compact hourly total adds the
recommended set's net fuel, ammunition, steel, and bauxite rates plus its expected bucket rate. The
total uses the same effective collection intervals and estimated resupply costs as the individual
cards; when any assigned fleet is busy, it explicitly excludes the current wait before that fleet
can dispatch the recommendation. The dispatch state has five explicit actions:

- `現在可派遣`: the fleet is free, supplied, and passes every known condition;
- `等待返航`: wait for the displayed return time, then perform any listed supply or composition
  action; the current expedition is labeled as fleet status rather than the recommendation. A busy
  fleet always requires collecting its result and resupplying before the next dispatch, regardless
  of the supply value KC3 reports while it is away;
- `領取返航結果`: the recorded return time has passed; collect the result, resupply, and then
  follow any composition action before dispatch;
- `需要補給`: fill fuel and ammunition before dispatch;
- `需要改編`: expand the composition check and resolve the highlighted missing conditions.

Passing composition details are collapsed into a green summary and remain available on demand.
Failed composition details open automatically. Income multiplier, estimated supply cost, sample
fleet, and great-success notes are kept in a separate calculation disclosure so they do not obscure
the next dispatch action. Alternative compositions supported by KC3 are evaluated by the same
requirement engine; the UI lists the matching requirement groups rather than inventing a fleet
composition.

For a busy fleet, hourly resource and bucket values are steady-state rates after the recommended
expedition can be dispatched. The UI labels those rates as excluding the current wait instead of
presenting them as income measured from the current time. A return time that has already passed is
shown as an instruction to collect the result; incomplete mission identifiers, names, or timestamps
fail snapshot validation rather than producing a guessed destination or date.

The success-mode choices, Daihatsu selector, and combined multiplier remain usable on both wide and
narrow views.

The recommendation candidate list covers expedition IDs 1–40 plus A1, A2, A3, and B1. All
candidates participate in **全選**, **推薦**, **水桶**, and **清除** presets. The game does not
expose a simple authoritative list of every unlocked expedition through the data used here, so a
checked but locked expedition can still appear. Users should uncheck expeditions they cannot select
in game. The expanded candidate panel displays this limitation directly above the presets and
candidate checkboxes.

The candidate section is collapsed when the recommendation page opens, and every candidate is
selected by default. Its collapsed summary shows whether all candidates remain selected or the
current selected count.

## Electron boundary

Two fixed IPC commands are accepted only from the currently loaded KC3 Strategy Room origin:

- `recommendation:expedition-summary`
- `recommendation:expedition-plan`

The plan request accepts a priority preference map where each resource is `optimize`, `constraint`,
or `ignore`. Optimized resources must use unique continuous ranks from 1 to 5. Constraint resources
currently default to `minimumNetYieldPerHour = 0`. The legacy custom-weight shape remains accepted
for compatibility. The request also accepts an operation
interval from 0 to 2,880 minutes, one to three fleets, a boolean great-success mode, a Daihatsu
count from zero to four, and unique candidate IDs from 1 to 40 plus the internal IDs 100, 101, 102,
and 110 for A1, A2, A3, and B1 respectively. The main process executes a fixed planner function in
the KC3 page context; request data is validated before it crosses that boundary.

The income and cost model follows the existing KC3 Scorer and Kancepts resource calculations where
available, but final ranking uses the normalized utility score above instead of raw weighted
resource totals. Kancepts is available at <https://javran.github.io/kancepts/> and its source is at
<https://github.com/Javran/kancepts>.

## Runtime isolation

This calculation runs in its own lazy worker lane, separate from fleet recommendation and other
resource tools. A different operation timing out does not cancel this calculation. Waiting queues are
bounded; idle workers are reclaimed after one minute. See [shell runtime architecture](shell-runtime-architecture.md).
