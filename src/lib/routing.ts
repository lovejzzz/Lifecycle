/**
 * CID Chat Command Router — pure function that classifies a user prompt
 * into a command route. Mirrors the routing logic in CIDPanel.tsx.
 *
 * This exists so we can benchmark routing accuracy without a React component.
 */

export type CommandRoute =
  | 'template'           // /template <name>
  | 'extend'             // add/extend/expand (when workflow exists)
  | 'generate'           // build/create/make/generate
  | 'solve'              // solve/fix/diagnose
  | 'status'             // status/report/health/dashboard
  | 'propagate'          // propagate/sync/refresh stale/update stale/run stale
  | 'layout'             // layout/arrange
  | 'optimize'           // optimize
  | 'approve-all'        // approve all
  | 'unlock-all'         // unlock all
  | 'activate-all'       // activate all
  | 'connect'            // connect X to Y
  | 'disconnect'         // disconnect X from Y
  | 'delete'             // delete/remove <name>
  | 'rename'             // rename X to Y
  | 'show-stale'         // show stale / show me what's stale
  | 'focus'              // focus/select/show/go to <name>
  | 'duplicate'          // duplicate/clone/copy <name>
  | 'add-node'           // add <category> called <name>
  | 'set-status'         // set X to <status> / lock X / unlock X
  | 'list'               // list <category|status|all>
  | 'describe'           // describe X as Y
  | 'swap'               // swap X and Y
  | 'content'            // content X: text
  | 'download'           // download/export node
  | 'undo'               // undo
  | 'redo'               // redo
  | 'group'              // group by category
  | 'clear-stale'        // clear stale
  | 'orphans'            // orphans
  | 'count'              // count/stats
  | 'merge'              // merge X and Y
  | 'deps'               // deps/dependencies <name>
  | 'reverse'            // reverse <name>
  | 'save-template'      // save template <name>
  | 'load-template'      // load template <name>
  | 'list-templates'     // templates
  | 'save-snapshot'       // save <name>
  | 'restore-snapshot'   // restore <name>
  | 'list-snapshots'     // snapshots
  | 'critical-path'      // critical path
  | 'isolate'            // isolate/subgraph <name>
  | 'summarize'          // summarize
  | 'validate'           // validate/check/audit
  | 'clone-workflow'     // clone workflow
  | 'what-if'            // what if / impact / without
  | 'preflight'          // preflight / dry run
  | 'retry-failed'       // retry failed
  | 'clear-results'      // clear results
  | 'diff-last-run'      // diff last run
  | 'refresh-node'       // refresh/update/regenerate <node name>
  | 'run-workflow'       // run workflow / run all
  | 'run-node'           // run/execute <node name>
  | 'explain'            // explain/trace
  | 'help'               // help/commands/?
  | 'why'                // why <name>
  | 'relabel'            // relabel all
  | 'teach'              // teach: <rule>
  | 'forget-rule'        // forget <number>
  | 'list-rules'         // rules
  | 'progress'           // progress
  | 'diff-snapshot'      // diff/compare <name>
  | 'batch-where'        // batch <status> where <field>=<value>
  | 'plan'               // plan / execution plan
  | 'search'             // search <term>
  | 'compress'           // compress/compact
  | 'bottlenecks'        // bottlenecks
  | 'suggest'            // suggest / what should I do
  | 'health-detail'      // health detail
  | 'auto-describe'      // auto-describe
  | 'refine'             // refine (note)
  | 'llm-fallback';      // anything else → send to LLM

/**
 * Classify a CID chat prompt into a command route.
 * @param prompt - The raw user input
 * @param hasWorkflow - Whether the canvas has existing nodes
 */
export function classifyRoute(prompt: string, hasWorkflow: boolean = false): CommandRoute {
  // Slash commands
  if (/^\/template\s+/i.test(prompt)) return 'template';
  if (/^\/clear\s*$/i.test(prompt) || /^\/new\s*$/i.test(prompt) || /^\/export\s*$/i.test(prompt) || /^\/mode\s*$/i.test(prompt)) return 'template'; // slash commands handled separately

  // Extend vs generate
  const isExtendRequest = hasWorkflow && /^(?:add|extend|expand|include|append|insert|also|plus|and also)\b/i.test(prompt);
  const isGenerateRequest = /^(?:build|create|make|generate|set up|design|start)\b/i.test(prompt);

  if (isExtendRequest) return 'extend';
  if (isGenerateRequest) return 'generate';

  // Solve
  if (/^(?:solve|fix|diagnose?|heal|repair)\b/i.test(prompt)) return 'solve';

  // Health detail (MUST come before generic status to avoid "health" matching first)
  if (/^(?:health\s+detail|health\s+breakdown|detailed?\s+health|health\s+report)\s*$/i.test(prompt)) return 'health-detail';

  // Status
  if (/^(?:status|report|health|dashboard)\b/i.test(prompt)) return 'status';

  // Propagate (includes "update stale", "run stale")
  if (/^(?:propagate?|sync|refresh\s*stale|regenerate\s*stale|update\s+(?:all\s+)?stale|run\s+(?:the\s+)?stale)\b/i.test(prompt)) return 'propagate';

  // Layout
  if (/^(?:layout|arrange)\b/i.test(prompt)) return 'layout';

  // Optimize
  if (/^optimi/i.test(prompt)) return 'optimize';

  // Batch where (MUST come before batch approve/unlock/activate to avoid "batch approve where..." matching approve-all)
  if (/^batch\s+\w+\s+where\s+/i.test(prompt)) return 'batch-where';

  // Batch status changes
  if (/^(?:approve\s+all|batch\s+approve)\b/i.test(prompt)) return 'approve-all';
  if (/^(?:unlock\s+all|batch\s+unlock)\b/i.test(prompt)) return 'unlock-all';
  if (/^(?:activate\s+all|batch\s+activate)\b/i.test(prompt)) return 'activate-all';

  // Connect / disconnect
  if (/^(?:connect|link|wire|attach)\s+.+\s+(?:to|with|→|->)\s+/i.test(prompt)) return 'connect';
  if (/^(?:disconnect|unlink|unwire|detach)\s+.+\s+(?:from|and|→|->)\s+/i.test(prompt)) return 'disconnect';

  // Delete
  if (/^(?:delete|remove|drop|destroy)\s+.+/i.test(prompt)) return 'delete';

  // Rename
  if (/^(?:rename|change name|relabel)\s+.+\s+(?:to|as|→|->)\s+/i.test(prompt)) return 'rename';

  // Show stale (MUST come before generic focus/show)
  if (/^(?:show|find|list)\s+(?:me\s+)?(?:what(?:'s| is)\s+)?stale/i.test(prompt)) return 'show-stale';
  if (/^(?:show|find|list)\s+stale/i.test(prompt)) return 'show-stale';

  // Focus / select / show <node>
  if (/^(?:focus|select|show|go to|find|zoom)\s+(?:on\s+)?["']?.+["']?\s*$/i.test(prompt)) return 'focus';

  // Clone workflow (MUST come before duplicate to avoid "clone workflow" matching duplicate)
  if (/^(?:clone|duplicate)\s+(?:workflow|graph|project|all)\s*$/i.test(prompt)) return 'clone-workflow';

  // Duplicate
  if (/^(?:duplicate|clone|copy)\s+["']?.+["']?\s*$/i.test(prompt)) return 'duplicate';

  // Add node by name
  if (/^(?:add|new)\s+\w+\s+(?:called|named|:)\s+/i.test(prompt) || /^(?:add|new)\s+\w+\s+["'].+["']/i.test(prompt)) return 'add-node';

  // Set status / lock / unlock
  if (/^(?:set|mark|change)\s+.+\s+(?:to|as|→)\s+\w+\s*$/i.test(prompt) || /^lock\s+["']?.+["']?\s*$/i.test(prompt) || /^unlock\s+["']?.+["']?\s*$/i.test(prompt)) return 'set-status';

  // List
  if (/^(?:list|show|inventory)\s+/i.test(prompt)) return 'list';

  // Describe
  if (/^(?:describe|annotate|document)\s+.+\s+(?:as:?|:)\s+/i.test(prompt)) return 'describe';

  // Swap
  if (/^(?:swap|switch|exchange)\s+.+\s+(?:and|with|↔)\s+/i.test(prompt)) return 'swap';

  // Content
  if (/^(?:content|write|fill)\s+.+(?::|=)\s+/i.test(prompt)) return 'content';

  // Download
  if (/^(?:download|export\s+node)\s+/i.test(prompt)) return 'download';

  // Undo / redo
  if (/^undo\s*$/i.test(prompt)) return 'undo';
  if (/^redo\s*$/i.test(prompt)) return 'redo';

  // Group
  if (/^(?:group|cluster|organize)\s*(?:by\s*)?(?:category|type)?\s*$/i.test(prompt)) return 'group';

  // Clear stale
  if (/^(?:clear|purge|remove)\s+stale\s*$/i.test(prompt)) return 'clear-stale';

  // Orphans
  if (/^(?:orphan|isolat|unconnected)\w*\s*$/i.test(prompt)) return 'orphans';

  // Count
  if (/^(?:count|stats|statistics|tally)\s*$/i.test(prompt)) return 'count';

  // Merge
  if (/^(?:merge|combine|fuse)\s+.+\s+(?:and|with|into|&)\s+/i.test(prompt)) return 'merge';

  // Deps
  if (/^(?:deps|dependencies|depend|upstream|downstream|chain)\s+/i.test(prompt)) return 'deps';

  // Reverse
  if (/^(?:reverse|flip|invert)\s+/i.test(prompt)) return 'reverse';

  // Templates
  if (/^save\s+template\s+["']?(.+?)["']?\s*$/i.test(prompt)) return 'save-template';
  if (/^(?:load|use)\s+template\s+["']?(.+?)["']?\s*$/i.test(prompt)) return 'load-template';
  if (/^(?:templates?|my\s+templates?)\s*$/i.test(prompt)) return 'list-templates';

  // Snapshots
  if (/^(?:save|snapshot)\s+["']?(.+?)["']?\s*$/i.test(prompt)) return 'save-snapshot';
  if (/^(?:restore|load)\s+["']?(.+?)["']?\s*$/i.test(prompt)) return 'restore-snapshot';
  if (/^(?:snapshots?|saved|bookmarks?)\s*$/i.test(prompt)) return 'list-snapshots';

  // Critical path
  if (/^(?:critical\s*path|longest\s*chain|bottleneck)\s*$/i.test(prompt)) return 'critical-path';

  // Isolate
  if (/^(?:isolate|subgraph|neighborhood|neighbours?)\s+/i.test(prompt)) return 'isolate';

  // Summarize
  if (/^(?:summarize|summary|executive|brief|overview)(?:\s+(?:the\s+)?(?:workflow|graph|project|all))?\s*$/i.test(prompt)) return 'summarize';

  // Validate
  if (/^(?:validate|integrity|check|audit)(?:\s+(?:the\s+)?(?:workflow|graph|project|all))?\s*$/i.test(prompt)) return 'validate';


  // What if
  if (/^(?:what\s*if|impact|without)\b/i.test(prompt)) return 'what-if';

  // Preflight
  if (/^(?:pre\s*flight|flight\s*check|dry\s*run|plan\s+run|execution\s+plan)\s*$/i.test(prompt)) return 'preflight';

  // Retry failed
  if (/^(?:retry|rerun|re-run)\s+(?:failed|errors?|skipped)\s*$/i.test(prompt)) return 'retry-failed';

  // Clear results
  if (/^(?:clear|reset)\s+(?:results?|execution|output)\s*$/i.test(prompt)) return 'clear-results';

  // Diff last run
  if (/^(?:diff\s+(?:last|prev(?:ious)?)|compare\s+(?:run|execution)s?)\s*$/i.test(prompt)) return 'diff-last-run';

  // Refresh / update / regenerate specific node (MUST come before run-workflow/run-node)
  if (/^(?:refresh|update|regenerate)\s+(?:the\s+)?["']?(.+?)["']?\s*$/i.test(prompt)) return 'refresh-node';

  // Run workflow
  if (/^(?:run|execute|start)\s+(?:workflow|all|pipeline|everything)\s*$/i.test(prompt)) return 'run-workflow';

  // Run specific node
  if (/^(?:run|execute)\s+["']?(.+?)["']?\s*$/i.test(prompt)) return 'run-node';

  // Explain
  if (/^(?:explain|walk\s*through|narrate|trace)\b/i.test(prompt)) return 'explain';

  // Help
  if (/^(?:help|commands|\?|what can you do)\s*$/i.test(prompt)) return 'help';

  // Why <node name> — but NOT "why is...", "why does...", "why are..." (those are questions for the LLM)
  if (/^(?:why|reason|purpose)\s+/i.test(prompt) && !/^why\s+(?:is|does|do|are|was|were|can|should|would|has|have|did)\b/i.test(prompt)) return 'why';

  // Relabel
  if (/^(?:relabel|re-label|fix\s+labels?|infer\s+labels?)\s*(?:all|edges?)?\s*$/i.test(prompt)) return 'relabel';

  // Teach / rules
  if (/^(?:teach|learn|remember)\s*:\s*(.+)$/i.test(prompt)) return 'teach';
  if (/^(?:forget|unlearn|remove rule)\s+(\d+)\s*$/i.test(prompt)) return 'forget-rule';
  if (/^(?:rules?|taught|learned)\s*$/i.test(prompt)) return 'list-rules';

  // Progress
  if (/^(?:progress|completion)\s*$/i.test(prompt)) return 'progress';

  // Diff snapshot
  if (/^(?:diff|compare)\s+["']?(.+?)["']?\s*$/i.test(prompt)) return 'diff-snapshot';

  // Plan
  if (/^(?:plan|execution\s*plan|steps|order)\s*$/i.test(prompt)) return 'plan';

  // Search
  if (/^(?:search|find|grep)\s+(.+)$/i.test(prompt)) return 'search';

  // Compress
  if (/^(?:compress|compact|simplify|dedupe|dedup)(?:\s+(?:the\s+)?(?:workflow|graph|project|all|nodes))?\s*$/i.test(prompt)) return 'compress';

  // Bottlenecks
  if (/^(?:bottleneck|bottlenecks|choke|chokepoint|hub|hubs|spof)\s*$/i.test(prompt)) return 'bottlenecks';

  // Suggest
  if (/^(?:suggest|next|what\s*(?:should|can)\s*I\s*do(?:\s+next|\s+now)?|recommendations?)\s*$/i.test(prompt)) return 'suggest';

  // Auto-describe
  if (/^(?:auto[- ]?describe|describe\s+all|fill\s+descriptions?)\s*$/i.test(prompt)) return 'auto-describe';

  // Refine
  if (/^(?:refine|extract|structure)(?:\s+(?:this\s+)?note)?\s*$/i.test(prompt)) return 'refine';

  // Everything else → LLM
  return 'llm-fallback';
}
