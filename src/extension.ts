import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
    apklabDataDir,
    DIST_DIR,
    outputChannel,
    QUARK_REPORT_FILENAME,
} from "./data/constants";
import { checkAndInstallTools, updateTools } from "./utils/updater";
import { UI } from "./interface";
import { apkMitm } from "./tools/apk-mitm";
import { Quark } from "./tools/quark-engine";
import { adb } from "./tools/adb";
import { apktool } from "./tools/apktool";
import { rootBypass } from "./tools/root-bypass";

export function activate(context: vscode.ExtensionContext): void {
    console.log("Activated apklab extension!");

    // create apklabDataDir if it doesn't exist
    if (!fs.existsSync(String(apklabDataDir))) {
        fs.mkdirSync(apklabDataDir);
    }

    // command for opening an apk file for decoding
    const openApkFileCommand = vscode.commands.registerCommand(
        "apklab.openApkFile",
        async () => {
            checkAndInstallTools()
                .then(async () => {
                    await UI.openApkFile();
                })
                .catch((e) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    outputChannel.appendLine(`APKLab process aborted: ${msg}`);
                });
        },
    );

    // command for rebuilding apk file
    const rebuildAPkFileCommand = vscode.commands.registerCommand(
        "apklab.rebuildApkFile",
        (uri: vscode.Uri) => {
            checkAndInstallTools()
                .then(async () => {
                    await UI.rebuildAPK(uri.fsPath);
                })
                .catch((e) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    outputChannel.appendLine(`APKLab process aborted: ${msg}`);
                });
        },
    );

    // command for installing apk file
    const installAPkFileCommand = vscode.commands.registerCommand(
        "apklab.installApkFile",
        (uri: vscode.Uri) => {
            adb.installAPK(uri.fsPath).catch(e => {
                const msg = e instanceof Error ? e.message : String(e);
                outputChannel.appendLine(`APKLab process aborted: ${msg}`);
            });
        },
    );

    // command for uninstalling app via adb
    const uninstallAppCommand = vscode.commands.registerCommand(
        "apklab.uninstallApp",
        () => adb.uninstallAPK(),
    );

    // command for launching app via adb
    const launchAppCommand = vscode.commands.registerCommand(
        "apklab.launchApp",
        () => adb.launchApp(),
    );

    // command for streaming logcat via adb
    const logcatAppCommand = vscode.commands.registerCommand(
        "apklab.logcatApp",
        () => adb.streamLogcat(),
    );

    // command for rebuilding and installing the apk
    const rebuildAndInstallAPkFileCommand = vscode.commands.registerCommand(
        "apklab.rebuildAndInstallApkFile",
        (uri: vscode.Uri) => {
            checkAndInstallTools()
                .then(async () => {
                    await UI.rebuildAPK(uri.fsPath);
                    const parentPath = path.parse(uri.fsPath).dir;
                    const apkPath = path.join(
                        parentPath,
                        DIST_DIR,
                        apktool.getApkNameFromApkToolYaml(uri.fsPath),
                    );
                    await adb.installAPK(apkPath);
                })
                .catch((e) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    outputChannel.appendLine(`APKLab process aborted: ${msg}`);
                });
        },
    );

    // command for patching files for https inspection
    const patchApkForHttpsCommand = vscode.commands.registerCommand(
        "apklab.patchApkForHttps",
        (uri: vscode.Uri) => apkMitm.applyMitmPatches(uri.fsPath),
    );

    // command for patching files for root bypass
    const patchApkForRootBypassCommand = vscode.commands.registerCommand(
        "apklab.patchApkForRootBypass",
        async (uri: vscode.Uri) => {
            const projectDir = path.dirname(uri.fsPath);
            await rootBypass.patchRootDetection(projectDir);
        },
    );

    // command to empty apktool framework resource dir
    const emptyFrameworkDirCommand = vscode.commands.registerCommand(
        "apklab.emptyFrameworkDir",
        () => {
            checkAndInstallTools()
                .then(async () => {
                    await apktool.emptyFrameworkDir();
                })
                .catch((e) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    outputChannel.appendLine(`APKLab process aborted: ${msg}`);
                });
        },
    );

    // command to show quark analysis report as web view
    const quarkReportCommand = vscode.commands.registerCommand(
        "apklab.quarkReport",
        (uri: vscode.Uri) => {
            Quark.showSummaryReport(uri.fsPath);
        },
    );

    context.subscriptions.push(
        openApkFileCommand,
        rebuildAPkFileCommand,
        installAPkFileCommand,
        uninstallAppCommand,
        launchAppCommand,
        logcatAppCommand,
        rebuildAndInstallAPkFileCommand,
        patchApkForHttpsCommand,
        patchApkForRootBypassCommand,
        emptyFrameworkDirCommand,
        quarkReportCommand,
    );

    // check if open folder contains quark report file
    // if it exists, show it as a report on open
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        const quarkReportFile = path.join(
            folders[0].uri.fsPath,
            QUARK_REPORT_FILENAME,
        );
        if (fs.existsSync(quarkReportFile)) {
            Quark.showSummaryReport(quarkReportFile);
        }
    }

    // check for the tools update
    updateTools();
}
