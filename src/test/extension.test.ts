import * as assert from "assert";
import * as vscode from "vscode";

suite("notinglm extension smoke", () => {
  test("mynote.open command is contributed", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("mynote.open"));
  });
});
