import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { glob } from "glob";
import {
    APKTOOL_YML_FILENAME,
    DIST_DIR,
    extensionConfigName,
    outputChannel,
} from "../data/constants";
import { apktool } from "./apktool";
import { executeProcess } from "../utils/executor";

export namespace rootBypass {
    const RETURN_FALSE_SMALI = [
        ".locals 1",
        "const/4 v0, 0x0",
        "return v0",
    ];

    const MY_ID_STORE_CLASS = "uz/myid/android/sdk/capture/core/MyIdStore";
    const STRING_PATCH_EXCLUDED_PREFIXES = [
        "android/",
        "androidx/",
        "com/android/",
        "com/facebook/",
        "com/google/",
        "java/",
        "javax/",
        "kotlin/",
        "kotlinx/",
        "org/apache/",
        "org/chromium/",
        "org/jetbrains/",
    ];
    const SHELL_CHANNEL_STRINGS = new Set(["sh", "exit", "stderr", "stdout"]);

    export interface SmaliMethodBlock {
        startLine: number;
        endLine: number;
        headerLine: string;
        methodName: string;
        returnType: string;
        modifiers: string;
        signature: string;
        bodyLines: string[];
    }

    export interface MethodPatchResult {
        filePath: string;
        line: number;
        signature: string;
        methodName: string;
        status: "patched" | "skipped" | "failed";
        reason: string;
        sdkId?: string;
    }

    interface FilePatchOutput {
        changed: boolean;
        content: string;
        methodResults: MethodPatchResult[];
    }

    export interface ClassMethodPatch {
        name: string;
        signature: string;
        replacementLines: string[];
    }

    export interface ClassPatchDefinition {
        className: string;
        methods: ClassMethodPatch[];
    }

    export interface SdkPatchDefinition {
        id: string;
        displayName: string;
        detectionClasses: string[];
        classPatches: ClassPatchDefinition[];
    }

    interface DetectedSdkPatch {
        definition: SdkPatchDefinition;
        matchedClasses: string[];
        targetFiles: string[];
    }

    interface StringPatchDefinition {
        original: string;
        replacement: string;
        category: "root" | "emulator" | "debug" | "vpn";
    }

    interface PatchAuditReport {
        generatedAt: string;
        projectDir: string;
        scannedFiles: number;
        selectedFiles: number;
        patchedFiles: number;
        patchedMethods: number;
        skippedMethods: number;
        failedMethods: number;
        detectedSdks: string[];
        appPackage?: string;
        verification: {
            enabled: boolean;
            status: "passed" | "failed" | "skipped";
            message: string;
        };
        files: {
            filePath: string;
            patched: number;
            skipped: number;
            failed: number;
            methods: MethodPatchResult[];
        }[];
    }

    const SUPPORTED_SDK_PATCHES: SdkPatchDefinition[] = [
        {
            id: "myid-sdk",
            displayName: "MyID SDK",
            detectionClasses: [MY_ID_STORE_CLASS],
            classPatches: [
                {
                    className: MY_ID_STORE_CLASS,
                    methods: [
                        {
                            name: "MyIdStore#getRaspDebugDetected",
                            signature: "getRaspDebugDetected()Z",
                            replacementLines: RETURN_FALSE_SMALI,
                        },
                        {
                            name: "MyIdStore#getRaspEmulatorDetected",
                            signature: "getRaspEmulatorDetected()Z",
                            replacementLines: RETURN_FALSE_SMALI,
                        },
                        {
                            name: "MyIdStore#getRaspHookDetected",
                            signature: "getRaspHookDetected()Z",
                            replacementLines: RETURN_FALSE_SMALI,
                        },
                        {
                            name: "MyIdStore#getRaspMemoryScanningDetected",
                            signature: "getRaspMemoryScanningDetected()Z",
                            replacementLines: RETURN_FALSE_SMALI,
                        },
                        {
                            name: "MyIdStore#getRaspRootDetected",
                            signature: "getRaspRootDetected()Z",
                            replacementLines: RETURN_FALSE_SMALI,
                        },
                        {
                            name: "MyIdStore#getRaspVirtualEnvironmentDetected",
                            signature: "getRaspVirtualEnvironmentDetected()Z",
                            replacementLines: RETURN_FALSE_SMALI,
                        },
                        {
                            name: "MyIdStore#setRaspDebugDetected",
                            signature: "setRaspDebugDetected(Z)V",
                            replacementLines: buildStaticFalseSetter(
                                "raspDebugDetected",
                            ),
                        },
                        {
                            name: "MyIdStore#setRaspEmulatorDetected",
                            signature: "setRaspEmulatorDetected(Z)V",
                            replacementLines: buildStaticFalseSetter(
                                "raspEmulatorDetected",
                            ),
                        },
                        {
                            name: "MyIdStore#setRaspHookDetected",
                            signature: "setRaspHookDetected(Z)V",
                            replacementLines: buildStaticFalseSetter(
                                "raspHookDetected",
                            ),
                        },
                        {
                            name: "MyIdStore#setRaspMemoryScanningDetected",
                            signature: "setRaspMemoryScanningDetected(Z)V",
                            replacementLines: buildStaticFalseSetter(
                                "raspMemoryScanningDetected",
                            ),
                        },
                        {
                            name: "MyIdStore#setRaspRootDetected",
                            signature: "setRaspRootDetected(Z)V",
                            replacementLines: buildStaticFalseSetter(
                                "raspRootDetected",
                            ),
                        },
                        {
                            name: "MyIdStore#setRaspVirtualEnvironmentDetected",
                            signature: "setRaspVirtualEnvironmentDetected(Z)V",
                            replacementLines: buildStaticFalseSetter(
                                "raspVirtualEnvironmentDetected",
                            ),
                        },
                    ],
                },
            ],
        },
    ];

    const STRING_PATCHES: StringPatchDefinition[] = [
        { original: "su", replacement: "pu", category: "root" },
        { original: "busybox", replacement: "pusybox", category: "root" },
        { original: "magisk", replacement: "pagisk", category: "root" },
        { original: "test-keys", replacement: "pest-keys", category: "root" },
        { original: "generic", replacement: "peneric", category: "emulator" },
        { original: "unknown", replacement: "pnknown", category: "emulator" },
        { original: "Emulator", replacement: "Pmulator", category: "emulator" },
        {
            original: "Android SDK built for x86",
            replacement: "Pndroid SDK built for x86",
            category: "emulator",
        },
        {
            original: "Android SDK built for arm64",
            replacement: "Pndroid SDK built for arm64",
            category: "emulator",
        },
        { original: "Genymotion", replacement: "Penymotion", category: "emulator" },
        {
            original: "/system/bin/su",
            replacement: "/system/bin/pu",
            category: "root",
        },
        {
            original: "/system/xbin/su",
            replacement: "/system/xbin/pu",
            category: "root",
        },
        {
            original: "/system/xbin/sudo",
            replacement: "/system/xbin/pudo",
            category: "root",
        },
        { original: "/sbin/su", replacement: "/sbin/pu", category: "root" },
        { original: "/su/bin/su", replacement: "/pu/bin/pu", category: "root" },
        {
            original: "/magisk/.core/bin/su",
            replacement: "/pagisk/.core/bin/pu",
            category: "root",
        },
        {
            original: "/system/app/Superuser.apk",
            replacement: "/system/app/Puperuser.apk",
            category: "root",
        },
        {
            original: "com.topjohnwu.magisk",
            replacement: "com.topjohnwu.pagisk",
            category: "root",
        },
        {
            original: "eu.chainfire.supersu",
            replacement: "eu.chainfire.pupersu",
            category: "root",
        },
        {
            original: "com.noshufou.android.su",
            replacement: "com.noshufou.android.pu",
            category: "root",
        },
        {
            original: "com.koushikdutta.superuser",
            replacement: "com.koushikdutta.puperuser",
            category: "root",
        },
        {
            original: "ro.build.tags=test-keys",
            replacement: "ro.build.tags=pest-keys",
            category: "root",
        },
        { original: "goldfish", replacement: "poldfish", category: "emulator" },
        { original: "ranchu", replacement: "panchu", category: "emulator" },
        { original: "google_sdk", replacement: "poogle_sdk", category: "emulator" },
        { original: "sdk_gphone", replacement: "pdk_gphone", category: "emulator" },
        { original: "genymotion", replacement: "penymotion", category: "emulator" },
        { original: "vbox86", replacement: "pbox86", category: "emulator" },
        { original: "vbox86p", replacement: "pbox86p", category: "emulator" },
        { original: "generic_x86", replacement: "peneric_x86", category: "emulator" },
        {
            original: "generic_x86_64",
            replacement: "peneric_x86_64",
            category: "emulator",
        },
        {
            original: "generic_arm64",
            replacement: "peneric_arm64",
            category: "emulator",
        },
        { original: "qemud", replacement: "pemud", category: "emulator" },
        { original: "qemu_pipe", replacement: "pemu_pipe", category: "emulator" },
        { original: "adb_enabled", replacement: "pdb_enabled", category: "debug" },
        {
            original: "development_settings_enabled",
            replacement: "qevelopment_settings_enabled",
            category: "debug",
        },
        { original: "sh", replacement: "ph", category: "root" },
        { original: "exit", replacement: "pxit", category: "root" },
        { original: "stderr", replacement: "ptderr", category: "root" },
        { original: "stdout", replacement: "ptdout", category: "root" },
        { original: "tun0", replacement: "pun0", category: "vpn" },
        { original: "ppp0", replacement: "qpp0", category: "vpn" },
    ];

    function buildStaticFalseSetter(fieldName: string): string[] {
        return [
            ".locals 1",
            "const/4 v0, 0x0",
            `sput-boolean v0, L${MY_ID_STORE_CLASS};->${fieldName}:Z`,
            "return-void",
        ];
    }

    function detectLineEnding(content: string): string {
        return content.includes("\r\n") ? "\r\n" : "\n";
    }

    function normalizeClassName(classDescriptor: string): string {
        if (!classDescriptor.startsWith("L") || !classDescriptor.endsWith(";")) {
            return "";
        }
        return classDescriptor.slice(1, -1);
    }

    function getSmaliClassNameFromPath(filePath: string): string | null {
        const normalized = filePath.replace(/\\/g, "/");
        const match = normalized.match(/\/smali[^/]*\/(.+)\.smali$/);
        return match?.[1] || null;
    }

    function isStringPatchExcludedClassName(className: string): boolean {
        return STRING_PATCH_EXCLUDED_PREFIXES.some((prefix) =>
            className.startsWith(prefix),
        );
    }

    function findMethodForLine(
        methods: SmaliMethodBlock[],
        lineIndex: number,
    ): SmaliMethodBlock | null {
        return (
            methods.find(
                (method) =>
                    lineIndex >= method.startLine && lineIndex <= method.endLine,
            ) || null
        );
    }

    export function extractManifestPackageName(
        manifestContent: string,
    ): string | null {
        const pkgMatch = manifestContent.match(/\bpackage="([^"]+)"/);
        return pkgMatch?.[1]?.trim() || null;
    }

    function resolveAppPackageName(projectDir: string): string | null {
        const manifestPath = path.join(projectDir, "AndroidManifest.xml");
        if (!fs.existsSync(manifestPath)) {
            return null;
        }

        try {
            return extractManifestPackageName(
                fs.readFileSync(manifestPath, "utf8"),
            );
        } catch {
            return null;
        }
    }

    export function parseSmaliMethods(content: string): SmaliMethodBlock[] {
        const methods: SmaliMethodBlock[] = [];
        const lines = content.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed.startsWith(".method ")) {
                continue;
            }

            let endLine = -1;
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim() === ".end method") {
                    endLine = j;
                    break;
                }
            }

            if (endLine === -1) {
                continue;
            }

            const headerLine = lines[i];
            const headerBody = headerLine.trim().slice(".method ".length).trim();
            const headerMatch = headerBody.match(
                /^(?:(.+?)\s+)?([^\s(]+)\(([^)]*)\)(\S+)$/,
            );

            if (!headerMatch) {
                i = endLine;
                continue;
            }

            methods.push({
                startLine: i,
                endLine,
                headerLine,
                methodName: headerMatch[2],
                returnType: headerMatch[4],
                modifiers: (headerMatch[1] || "").trim(),
                signature: `${headerMatch[2]}(${headerMatch[3] || ""})${headerMatch[4]}`,
                bodyLines: lines.slice(i + 1, endLine),
            });

            i = endLine;
        }

        return methods;
    }

    function parseClassDescriptor(content: string): string {
        const classMatch = content.match(/^\.class\s+.*\s+(L[^;]+;)/m);
        return classMatch?.[1] || "";
    }

    function extractPreservedMethodMetadata(bodyLines: string[]): string[] {
        const preserved: string[] = [];
        let index = 0;

        while (index < bodyLines.length) {
            const line = bodyLines[index];
            const trimmed = line.trim();

            if (trimmed.length === 0 || trimmed.startsWith("#")) {
                preserved.push(line);
                index++;
                continue;
            }

            if (
                trimmed.startsWith(".param") ||
                trimmed.startsWith(".annotation")
            ) {
                preserved.push(line);
                const endDirective = trimmed.startsWith(".param")
                    ? ".end param"
                    : ".end annotation";
                index++;

                while (index < bodyLines.length) {
                    preserved.push(bodyLines[index]);
                    if (bodyLines[index].trim() === endDirective) {
                        index++;
                        break;
                    }
                    index++;
                }
                continue;
            }

            if (
                trimmed === ".prologue" ||
                trimmed.startsWith(".line ") ||
                trimmed.startsWith(".source ")
            ) {
                preserved.push(line);
                index++;
                continue;
            }

            break;
        }

        while (
            preserved.length > 0 &&
            preserved[preserved.length - 1].trim().length === 0
        ) {
            preserved.pop();
        }

        return preserved;
    }

    function buildReplacementMethodLines(
        method: SmaliMethodBlock,
        replacementLines: string[],
    ): string[] {
        const preservedMetadata = extractPreservedMethodMetadata(method.bodyLines);
        return [
            method.headerLine,
            ...preservedMetadata,
            ...(preservedMetadata.length > 0 ? [""] : []),
            ...replacementLines.map((line) => `    ${line}`),
            ".end method",
        ];
    }

    function isMethodAlreadyPatched(
        method: SmaliMethodBlock,
        replacementLines: string[],
    ): boolean {
        const compactBody = method.bodyLines
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith(".param"))
            .filter((line) => !line.startsWith(".annotation"))
            .filter((line) => !line.startsWith(".end annotation"))
            .filter((line) => line !== ".prologue")
            .filter((line) => !line.startsWith(".line "))
            .filter((line) => !line.startsWith(".source "));

        return compactBody.join("\n") === replacementLines.join("\n");
    }

    export function validateSmaliStructure(content: string): boolean {
        const lines = content.split(/\r?\n/);
        let depth = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith(".method ")) {
                depth++;
            } else if (trimmed === ".end method") {
                depth--;
                if (depth < 0) {
                    return false;
                }
            }
        }

        return depth === 0;
    }

    function hasStringPatchCandidate(content: string): boolean {
        return STRING_PATCHES.some((patch) =>
            content.includes(`"${patch.original}"`),
        );
    }

    function methodSupportsStringMutation(method: SmaliMethodBlock | null): boolean {
        if (!method) {
            return false;
        }

        const bodyContent = method.bodyLines.join("\n");
        return [
            "Landroid/os/Build;->",
            "Ljava/io/File;->exists()Z",
            "Ljava/lang/Runtime;->exec(",
            "Landroid/content/pm/PackageManager;->getPackageInfo(",
            "Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z",
            "Ljava/lang/String;->startsWith(Ljava/lang/String;)Z",
            "Ljava/lang/String;->equals(Ljava/lang/Object;)Z",
            "android.os.SystemProperties",
        ].some((indicator) => bodyContent.includes(indicator));
    }

    function methodSupportsShellChannelMutation(method: SmaliMethodBlock | null): boolean {
        if (!method) {
            return false;
        }

        const bodyContent = method.bodyLines.join("\n");
        return [
            "Ljava/lang/Runtime;->exec(",
            "Ljava/lang/ProcessBuilder;",
            "Ljava/io/File;->exists()Z",
            "Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;",
            "/system/bin/",
            "/system/xbin/",
            "/sbin/",
            "busybox",
            "su",
            "test-keys",
            "magisk",
        ].some((indicator) => bodyContent.includes(indicator));
    }

    function methodSupportsPathListMutation(method: SmaliMethodBlock | null): boolean {
        if (!method) {
            return false;
        }

        const bodyContent = method.bodyLines.join("\n");
        return (
            bodyContent.includes("Ljava/util/ArrayList;->contains(Ljava/lang/Object;)Z") &&
            [
                "/system/bin/",
                "/system/xbin/",
                "/sbin/",
                "/su/bin/",
                "/magisk/",
                "Superuser.apk",
                "busybox",
                "su",
                "sudo",
            ].some((indicator) => bodyContent.includes(indicator))
        );
    }

    function findClassPatchForContent(
        content: string,
        sdkPatch: SdkPatchDefinition,
    ): ClassPatchDefinition | null {
        const className = normalizeClassName(parseClassDescriptor(content));
        if (!className) {
            return null;
        }

        return (
            sdkPatch.classPatches.find((patch) => patch.className === className) || null
        );
    }

    export function patchSmaliContent(
        content: string,
        filePath: string,
        sdkPatch?: SdkPatchDefinition,
    ): FilePatchOutput {
        if (!sdkPatch) {
            return {
                changed: false,
                content,
                methodResults: [],
            };
        }

        const classPatch = findClassPatchForContent(content, sdkPatch);
        if (!classPatch) {
            return {
                changed: false,
                content,
                methodResults: [],
            };
        }

        const lineEnding = detectLineEnding(content);
        const methods = parseSmaliMethods(content);
        const lines = content.split(/\r?\n/);
        const methodResults: MethodPatchResult[] = [];
        let changed = false;

        for (const method of [...methods].sort((a, b) => b.startLine - a.startLine)) {
            const methodPatch = classPatch.methods.find(
                (candidate) => candidate.signature === method.signature,
            );
            if (!methodPatch) {
                continue;
            }

            if (/\b(native|abstract)\b/.test(method.modifiers)) {
                methodResults.push({
                    filePath,
                    line: method.startLine + 1,
                    signature: method.signature,
                    methodName: method.methodName,
                    status: "skipped",
                    reason: "native-or-abstract-method",
                    sdkId: sdkPatch.id,
                });
                continue;
            }

            if (isMethodAlreadyPatched(method, methodPatch.replacementLines)) {
                methodResults.push({
                    filePath,
                    line: method.startLine + 1,
                    signature: method.signature,
                    methodName: method.methodName,
                    status: "skipped",
                    reason: "already-patched",
                    sdkId: sdkPatch.id,
                });
                continue;
            }

            const replacementMethodLines = buildReplacementMethodLines(
                method,
                methodPatch.replacementLines,
            );
            lines.splice(
                method.startLine,
                method.endLine - method.startLine + 1,
                ...replacementMethodLines,
            );
            changed = true;

            methodResults.push({
                filePath,
                line: method.startLine + 1,
                signature: method.signature,
                methodName: method.methodName,
                status: "patched",
                reason: "static-signature-patch",
                sdkId: sdkPatch.id,
            });
        }

        const patchedContent = lines.join(lineEnding);
        if (changed && !validateSmaliStructure(patchedContent)) {
            return {
                changed: false,
                content,
                methodResults: methodResults.map((entry) =>
                    entry.status === "patched"
                        ? {
                              ...entry,
                              status: "failed" as const,
                              reason: "post-patch-structure-validation-failed",
                          }
                        : entry,
                ),
            };
        }

        return {
            changed,
            content: patchedContent,
            methodResults,
        };
    }

    export function patchStringConstantsContent(
        content: string,
        filePath: string,
    ): FilePatchOutput {
        const className = normalizeClassName(parseClassDescriptor(content));
        if (className && isStringPatchExcludedClassName(className)) {
            return {
                changed: false,
                content,
                methodResults: [],
            };
        }

        if (!hasStringPatchCandidate(content)) {
            return {
                changed: false,
                content,
                methodResults: [],
            };
        }

        const lineEnding = detectLineEnding(content);
        const lines = content.split(/\r?\n/);
        const methods = parseSmaliMethods(content);
        const methodResults: MethodPatchResult[] = [];
        let changed = false;

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            const match = line.match(
                /^(\s*const-string(?:\/jumbo)?\s+\S+,\s+")([^"]+)(".*)$/,
            );
            if (!match) {
                continue;
            }

            const patch = STRING_PATCHES.find(
                (candidate) => candidate.original === match[2],
            );
            if (!patch) {
                continue;
            }

            const method = findMethodForLine(methods, index);
            if (
                !methodSupportsStringMutation(method) &&
                !methodSupportsPathListMutation(method)
            ) {
                continue;
            }
            if (
                SHELL_CHANNEL_STRINGS.has(patch.original) &&
                !methodSupportsShellChannelMutation(method)
            ) {
                continue;
            }

            lines[index] = `${match[1]}${patch.replacement}${match[3]}`;
            changed = true;

            methodResults.push({
                filePath,
                line: index + 1,
                signature: method?.signature || "<const-string>",
                methodName: method?.methodName || "<class-init>",
                status: "patched",
                reason: `string-constant-${patch.category}-mutation`,
            });
        }

        const patchedContent = lines.join(lineEnding);
        if (changed && !validateSmaliStructure(patchedContent)) {
            return {
                changed: false,
                content,
                methodResults: methodResults.map((entry) => ({
                    ...entry,
                    status: "failed" as const,
                    reason: "post-patch-structure-validation-failed",
                })),
            };
        }

        return {
            changed,
            content: patchedContent,
            methodResults,
        };
    }

    function detectSdkPatches(smaliFiles: string[]): DetectedSdkPatch[] {
        const classNameToPath = new Map<string, string>();
        for (const file of smaliFiles) {
            const className = getSmaliClassNameFromPath(file);
            if (className) {
                classNameToPath.set(className, file);
            }
        }

        return SUPPORTED_SDK_PATCHES.flatMap((definition) => {
            const matchedClasses = definition.detectionClasses.filter((className) =>
                classNameToPath.has(className),
            );
            if (matchedClasses.length === 0) {
                return [];
            }

            const targetFiles = definition.classPatches
                .map((patch) => classNameToPath.get(patch.className))
                .filter((filePath): filePath is string => Boolean(filePath));

            return [
                {
                    definition,
                    matchedClasses,
                    targetFiles: [...new Set(targetFiles)],
                },
            ];
        });
    }

    async function detectStringPatchFiles(smaliFiles: string[]): Promise<string[]> {
        const candidates: string[] = [];
        const chunkSize = 64;

        for (let start = 0; start < smaliFiles.length; start += chunkSize) {
            const batch = smaliFiles.slice(start, start + chunkSize);
            const results = await Promise.all(
                batch.map(async (filePath) => {
                    const className = getSmaliClassNameFromPath(filePath);
                    if (className && isStringPatchExcludedClassName(className)) {
                        return null;
                    }
                    try {
                        const content = await fs.promises.readFile(filePath, "utf8");
                        return hasStringPatchCandidate(content) ? filePath : null;
                    } catch {
                        return null;
                    }
                }),
            );

            candidates.push(
                ...results.filter((filePath): filePath is string => Boolean(filePath)),
            );
        }

        return candidates;
    }

    async function verifyPatchedProjectBuild(
        projectDir: string,
    ): Promise<{ status: "passed" | "failed" | "skipped"; message: string }> {
        const apktoolYmlPath = path.join(projectDir, APKTOOL_YML_FILENAME);
        if (!fs.existsSync(apktoolYmlPath)) {
            return {
                status: "skipped",
                message: "apktool.yml not found; rebuild verification skipped",
            };
        }

        const extensionConfig = vscode.workspace.getConfiguration(extensionConfigName);
        const apktoolPath = extensionConfig.get("apktoolPath");
        if (!apktoolPath || !fs.existsSync(String(apktoolPath))) {
            return {
                status: "skipped",
                message: "apktool path not configured; rebuild verification skipped",
            };
        }

        const outputApkName = apktool.getApkNameFromApkToolYaml(apktoolYmlPath);
        if (!outputApkName) {
            return {
                status: "skipped",
                message: "unable to determine apkFileName from apktool.yml",
            };
        }

        const outputApkPath = path.join(projectDir, DIST_DIR, outputApkName);
        try {
            await executeProcess({
                name: "Root bypass rebuild verification",
                report: "Validating root bypass patch by rebuilding APK",
                command: "java",
                args: ["-jar", String(apktoolPath), "b", projectDir],
                shouldExist: outputApkPath,
            });
            return {
                status: "passed",
                message: "rebuild verification passed",
            };
        } catch (error) {
            return {
                status: "failed",
                message:
                    error instanceof Error
                        ? error.message
                        : "rebuild verification failed",
            };
        }
    }

    async function writeAuditReport(
        projectDir: string,
        report: PatchAuditReport,
    ): Promise<string> {
        const reportDir = path.join(projectDir, DIST_DIR);
        await fs.promises.mkdir(reportDir, { recursive: true });
        const reportPath = path.join(reportDir, "root-bypass-report.json");
        await fs.promises.writeFile(
            reportPath,
            JSON.stringify(report, null, 2),
            "utf8",
        );
        return reportPath;
    }

    export async function patchRootDetection(projectDir: string): Promise<void> {
        if (!projectDir || !fs.existsSync(projectDir)) {
            vscode.window.showErrorMessage(
                `APKLab: Invalid project directory: ${projectDir}`,
            );
            return;
        }

        const reportTitle = "Scanning and patching Root/Emulator Detection (Smali)";
        outputChannel.show();
        outputChannel.appendLine("-".repeat(reportTitle.length));
        outputChannel.appendLine(reportTitle);
        outputChannel.appendLine("-".repeat(reportTitle.length));

        try {
            const appPackageName = resolveAppPackageName(projectDir);
            const allSmaliFiles = await glob(path.join(projectDir, "smali*/**/*.smali"), {
                nodir: true,
            });
            const detectedSdkPatches = detectSdkPatches(allSmaliFiles);
            const stringPatchFiles = await detectStringPatchFiles(allSmaliFiles);
            const selectedFiles = [
                ...new Set([
                    ...detectedSdkPatches.flatMap((sdk) => sdk.targetFiles),
                    ...stringPatchFiles,
                ]),
            ];

            const auditReport: PatchAuditReport = {
                generatedAt: new Date().toISOString(),
                projectDir,
                scannedFiles: allSmaliFiles.length,
                selectedFiles: selectedFiles.length,
                patchedFiles: 0,
                patchedMethods: 0,
                skippedMethods: 0,
                failedMethods: 0,
                detectedSdks: detectedSdkPatches.map((sdk) => sdk.definition.displayName),
                appPackage: appPackageName || undefined,
                verification: {
                    enabled: false,
                    status: "skipped",
                    message: "verification not requested",
                },
                files: [],
            };

            outputChannel.appendLine(
                `Supported SDK detections: ${
                    auditReport.detectedSdks.length > 0
                        ? auditReport.detectedSdks.join(", ")
                        : "none"
                }`,
            );
            if (appPackageName) {
                outputChannel.appendLine(`App package: ${appPackageName}`);
            }
            outputChannel.appendLine(
                `Smali files selected for analysis: ${selectedFiles.length}/${allSmaliFiles.length}`,
            );
            outputChannel.appendLine(
                `String-constant candidate files: ${stringPatchFiles.length}`,
            );

            if (selectedFiles.length === 0) {
                const reportPath = await writeAuditReport(projectDir, auditReport);
                outputChannel.appendLine(`Root bypass report saved: ${reportPath}`);
                outputChannel.appendLine(
                    "No supported MyID SDK classes or string-based detector constants were found.",
                );
                vscode.window.showInformationMessage(
                    "APKLab: No supported MyID SDK classes or string-based detector constants were found.",
                );
                return;
            }

            for (const sdkPatch of detectedSdkPatches) {
                outputChannel.appendLine(
                    `Detected ${sdkPatch.definition.displayName}: ${sdkPatch.matchedClasses.join(", ")}`,
                );
            }

            for (const filePath of selectedFiles) {
                const sdkPatch = detectedSdkPatches.find((sdk) =>
                    sdk.targetFiles.includes(filePath),
                )?.definition;
                const original = await fs.promises.readFile(filePath, "utf8");
                const sdkOutput = patchSmaliContent(original, filePath, sdkPatch);
                const stringOutput = patchStringConstantsContent(
                    sdkOutput.content,
                    filePath,
                );
                const patchOutput: FilePatchOutput = {
                    changed: sdkOutput.changed || stringOutput.changed,
                    content: stringOutput.content,
                    methodResults: [
                        ...sdkOutput.methodResults,
                        ...stringOutput.methodResults,
                    ],
                };

                if (patchOutput.changed) {
                    await fs.promises.writeFile(filePath, patchOutput.content, "utf8");
                    auditReport.patchedFiles++;
                    outputChannel.appendLine(`Patched: ${path.basename(filePath)}`);
                }

                const patched = patchOutput.methodResults.filter(
                    (entry) => entry.status === "patched",
                ).length;
                const skipped = patchOutput.methodResults.filter(
                    (entry) => entry.status === "skipped",
                ).length;
                const failed = patchOutput.methodResults.filter(
                    (entry) => entry.status === "failed",
                ).length;

                auditReport.patchedMethods += patched;
                auditReport.skippedMethods += skipped;
                auditReport.failedMethods += failed;

                if (patchOutput.methodResults.length > 0) {
                    auditReport.files.push({
                        filePath,
                        patched,
                        skipped,
                        failed,
                        methods: patchOutput.methodResults,
                    });
                }
            }

            const extensionConfig = vscode.workspace.getConfiguration(extensionConfigName);
            const verifyRebuild = extensionConfig.get(
                "rootBypassVerifyRebuild",
                true,
            );

            if (verifyRebuild && auditReport.patchedMethods > 0) {
                auditReport.verification = {
                    enabled: true,
                    ...(await verifyPatchedProjectBuild(projectDir)),
                };
            } else {
                auditReport.verification = {
                    enabled: Boolean(verifyRebuild),
                    status: "skipped",
                    message:
                        auditReport.patchedMethods > 0
                            ? "verification disabled by configuration"
                            : "no methods patched; verification skipped",
                };
            }

            const reportPath = await writeAuditReport(projectDir, auditReport);
            outputChannel.appendLine(`Root bypass report saved: ${reportPath}`);

            if (auditReport.patchedMethods > 0) {
                const message =
                    `Patched ${auditReport.patchedMethods} methods in ${auditReport.patchedFiles} files. ` +
                    `Skipped: ${auditReport.skippedMethods}, Failed: ${auditReport.failedMethods}. ` +
                    `Verification: ${auditReport.verification.status}.`;
                outputChannel.appendLine(`\n${message}`);
                vscode.window.showInformationMessage(`APKLab: ${message}`);
                return;
            }

            const message =
                `Detected MyID SDK methods but no methods required patching. ` +
                `Skipped: ${auditReport.skippedMethods}, Failed: ${auditReport.failedMethods}.`;
            outputChannel.appendLine(message);
            vscode.window.showInformationMessage(`APKLab: ${message}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(message);
            outputChannel.appendLine("Failed to apply root bypass patch!");
            vscode.window.showErrorMessage(
                "APKLab: Failed to apply root bypass patch!",
            );
        }
    }
}
