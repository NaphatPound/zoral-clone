import * as Blockly from "blockly";
import { javascriptGenerator, Order } from "blockly/javascript";

let registered = false;

export function ensureCustomBlocksRegistered(): void {
  if (registered) return;
  registered = true;

  Blockly.Blocks["workflow_input_get"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField("input.")
        .appendField(new Blockly.FieldTextInput("a"), "FIELD");
      this.setOutput(true, null);
      this.setColour(160);
      this.setTooltip("Read a property from the workflow input");
    },
  };
  javascriptGenerator.forBlock["workflow_input_get"] = function (block) {
    const field = block.getFieldValue("FIELD") || "";
    const safe = JSON.stringify(field);
    return [`input?.[${safe}]`, Order.MEMBER];
  };

  Blockly.Blocks["workflow_globals_get"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField("globals.")
        .appendField(new Blockly.FieldTextInput("name"), "FIELD");
      this.setOutput(true, null);
      this.setColour(200);
      this.setTooltip("Read a global variable (passed via context.globals)");
    },
  };
  javascriptGenerator.forBlock["workflow_globals_get"] = function (block) {
    const field = block.getFieldValue("FIELD") || "";
    const safe = JSON.stringify(field);
    return [
      `(typeof globals !== "undefined" ? globals?.[${safe}] : undefined)`,
      Order.CONDITIONAL,
    ];
  };

  Blockly.Blocks["workflow_return"] = {
    init(this: Blockly.Block) {
      this.appendValueInput("VALUE").appendField("return");
      this.setPreviousStatement(true, null);
      this.setColour(20);
      this.setTooltip("Return a value as the script result");
    },
  };
  javascriptGenerator.forBlock["workflow_return"] = function (block, generator) {
    const value =
      generator.valueToCode(block, "VALUE", Order.NONE) || "undefined";
    return `return ${value};\n`;
  };

  Blockly.Blocks["workflow_object_3"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField("object");
      this.appendValueInput("V0")
        .appendField(new Blockly.FieldTextInput("key1"), "K0")
        .appendField(":");
      this.appendValueInput("V1")
        .appendField(new Blockly.FieldTextInput("key2"), "K1")
        .appendField(":");
      this.appendValueInput("V2")
        .appendField(new Blockly.FieldTextInput(""), "K2")
        .appendField(":");
      this.setInputsInline(false);
      this.setOutput(true, null);
      this.setColour(290);
      this.setTooltip("Build an object literal with up to 3 entries");
    },
  };
  javascriptGenerator.forBlock["workflow_object_3"] = function (
    block,
    generator,
  ) {
    const parts: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const key = block.getFieldValue(`K${i}`);
      if (!key) continue;
      const value =
        generator.valueToCode(block, `V${i}`, Order.NONE) || "undefined";
      parts.push(`${JSON.stringify(key)}: ${value}`);
    }
    return [`{ ${parts.join(", ")} }`, Order.ATOMIC];
  };

  Blockly.Blocks["workflow_spread_input"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField("...input (passthrough)");
      this.setOutput(true, null);
      this.setColour(160);
      this.setTooltip("Spread the entire input object — used inside an object literal");
    },
  };
  javascriptGenerator.forBlock["workflow_spread_input"] = function () {
    return ["...(input ?? {})", Order.ATOMIC];
  };

  Blockly.Blocks["workflow_nullish"] = {
    init(this: Blockly.Block) {
      this.appendValueInput("A");
      this.appendValueInput("B").appendField("??");
      this.setInputsInline(true);
      this.setOutput(true, null);
      this.setColour(230);
      this.setTooltip("Nullish coalescing: returns A if not null/undefined, else B");
    },
  };
  javascriptGenerator.forBlock["workflow_nullish"] = function (block, generator) {
    const a = generator.valueToCode(block, "A", Order.LOGICAL_OR) || "undefined";
    const b = generator.valueToCode(block, "B", Order.LOGICAL_OR) || "undefined";
    return [`(${a} ?? ${b})`, Order.LOGICAL_OR];
  };
}

export const WORKFLOW_TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Workflow",
      colour: "160",
      contents: [
        { kind: "block", type: "workflow_input_get" },
        { kind: "block", type: "workflow_globals_get" },
        { kind: "block", type: "workflow_return" },
        { kind: "block", type: "workflow_object_3" },
        { kind: "block", type: "workflow_spread_input" },
        { kind: "block", type: "workflow_nullish" },
      ],
    },
    {
      kind: "category",
      name: "Logic",
      colour: "210",
      contents: [
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_negate" },
        { kind: "block", type: "logic_boolean" },
        { kind: "block", type: "logic_null" },
        { kind: "block", type: "logic_ternary" },
      ],
    },
    {
      kind: "category",
      name: "Math",
      colour: "230",
      contents: [
        { kind: "block", type: "math_number" },
        { kind: "block", type: "math_arithmetic" },
        { kind: "block", type: "math_single" },
        { kind: "block", type: "math_round" },
        { kind: "block", type: "math_modulo" },
      ],
    },
    {
      kind: "category",
      name: "Text",
      colour: "160",
      contents: [
        { kind: "block", type: "text" },
        { kind: "block", type: "text_join" },
        { kind: "block", type: "text_length" },
        { kind: "block", type: "text_indexOf" },
      ],
    },
    {
      kind: "category",
      name: "Variables",
      colour: "330",
      custom: "VARIABLE",
    },
  ],
};

export function generateScriptFromWorkspace(
  workspace: Blockly.WorkspaceSvg,
): string {
  const code = javascriptGenerator.workspaceToCode(workspace).trim();
  return code;
}

export function serializeWorkspace(
  workspace: Blockly.WorkspaceSvg,
): string {
  const state = Blockly.serialization.workspaces.save(workspace);
  return JSON.stringify(state);
}

export function loadWorkspace(
  workspace: Blockly.WorkspaceSvg,
  json: string | undefined,
): void {
  if (!json) return;
  try {
    const state = JSON.parse(json);
    Blockly.serialization.workspaces.load(state, workspace);
  } catch {
    // ignore — leave workspace empty
  }
}
