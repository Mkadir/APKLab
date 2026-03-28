import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { glob } from "glob";
import { outputChannel } from "../data/constants";

export namespace rootBypass {
    const ROOT_METHODS = [
        "checkForSuBinary",
        "checkForRootNative",
        "checkForMagiskBinary",
        "isDeviceRooted",
        "detectRootManagementApps",
        "detectTestKeys",
        "detectPotentiallyDangerousApps",
        "isRooted",
        "isRootedWithBusyBoxCheck",
        "checkRoot",
        "getRootStatus",
    ];

    /**
     * Scans for RootBeer and common root detection methods across all smali files
     * and overrides them to return false.
     * @param projectDir The decompiled APK project directory containing smali/
     */
    export async function patchRootDetection(projectDir: string): Promise<void> {
        if (!projectDir || !fs.existsSync(projectDir)) {
            vscode.window.showErrorMessage(
                `APKLab: Invalid project directory: ${projectDir}`,
            );
            return;
        }

        const report = "Scanning and patching Root Detection (Smali)";
        outputChannel.show();
        outputChannel.appendLine("-".repeat(report.length));
        outputChannel.appendLine(report);
        outputChannel.appendLine("-".repeat(report.length));

        try {
            // Find all smali files recursively
            const smaliFiles = await glob(projectDir + "/smali*/**/*.smali");
            let patchedFiles = 0;
            let patchedMethods = 0;

            // Regex matches .method <modifiers> <name>(<args>)Z ... .end method
            // It captures the signature and modifiers, ensuring we only patch methods returning a boolean (Z).
            const methodRegex = new RegExp(
                `^\\.method (.*? )?(${ROOT_METHODS.join("|")})\\(.*?\\)Z\\s*([\\s\\S]*?)\\.end method`,
                "gm",
            );

            for (const file of smaliFiles) {
                let content = await fs.promises.readFile(file, "utf8");
                let changed = false;

                content = content.replace(methodRegex, (match, modifiers = "", methodName, body) => {
                    changed = true;
                    patchedMethods++;
                    return `.method ${modifiers}${methodName}()Z\n    .locals 1\n\n    const/4 v0, 0x0\n\n    return v0\n.end method`;
                });

                if (changed) {
                    await fs.promises.writeFile(file, content, "utf8");
                    outputChannel.appendLine(`Patched root check in: ${path.basename(file)}`);
                    patchedFiles++;
                }
            }

            if (patchedFiles > 0) {
                const msg = `Successfully bypassed ${patchedMethods} root checks across ${patchedFiles} files!`;
                outputChannel.appendLine("\\n" + msg);
                vscode.window.showInformationMessage("APKLab: " + msg);
            } else {
                outputChannel.appendLine("No standard root detection signatures found.");
                vscode.window.showInformationMessage(
                    "APKLab: No recognizable root detection signatures found to bypass.",
                );
            }
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : String(err);
            outputChannel.appendLine(errorMessage);
            outputChannel.appendLine("Failed to apply root bypass patch!");
            vscode.window.showErrorMessage(
                "APKLab: Failed to apply root bypass patch!",
            );
        }
    }
}
