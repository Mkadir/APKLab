import * as assert from "assert";
import { rootBypass } from "../../tools/root-bypass";

describe("Root Bypass Smali Patcher", function () {
    it("extracts package name from AndroidManifest", function () {
        const manifest = [
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
            "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\" package=\"com.example.realapp\">",
            "</manifest>",
        ].join("\n");

        const result = rootBypass.extractManifestPackageName(manifest);
        assert.strictEqual(result, "com.example.realapp");
    });

    it("patches MyID root getter with an exact static signature", function () {
        const smali = [
            ".class public Luz/myid/android/sdk/capture/core/MyIdStore;",
            ".super Ljava/lang/Object;",
            "",
            ".method public final getRaspRootDetected()Z",
            "    .locals 2",
            "    const/4 v0, 0x1",
            "    return v0",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchSmaliContent(
            smali,
            "MyIdStore.smali",
            {
                id: "myid-sdk",
                displayName: "MyID SDK",
                detectionClasses: ["uz/myid/android/sdk/capture/core/MyIdStore"],
                classPatches: [
                    {
                        className: "uz/myid/android/sdk/capture/core/MyIdStore",
                        methods: [
                            {
                                name: "MyIdStore#getRaspRootDetected",
                                signature: "getRaspRootDetected()Z",
                                replacementLines: [
                                    ".locals 1",
                                    "const/4 v0, 0x0",
                                    "return v0",
                                ],
                            },
                        ],
                    },
                ],
            },
        );

        assert.strictEqual(result.changed, true);
        const decision = result.methodResults.find(
            (entry) => entry.methodName === "getRaspRootDetected",
        );
        assert.ok(decision);
        assert.strictEqual(decision?.status, "patched");
        assert.strictEqual(decision?.reason, "static-signature-patch");
    });

    it("patches MyID emulator setter to force false state", function () {
        const smali = [
            ".class public Luz/myid/android/sdk/capture/core/MyIdStore;",
            ".super Ljava/lang/Object;",
            "",
            ".method public final setRaspEmulatorDetected(Z)V",
            "    .locals 2",
            "    sput-boolean p1, Luz/myid/android/sdk/capture/core/MyIdStore;->raspEmulatorDetected:Z",
            "    return-void",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchSmaliContent(
            smali,
            "MyIdStore.smali",
            {
                id: "myid-sdk",
                displayName: "MyID SDK",
                detectionClasses: ["uz/myid/android/sdk/capture/core/MyIdStore"],
                classPatches: [
                    {
                        className: "uz/myid/android/sdk/capture/core/MyIdStore",
                        methods: [
                            {
                                name: "MyIdStore#setRaspEmulatorDetected",
                                signature: "setRaspEmulatorDetected(Z)V",
                                replacementLines: [
                                    ".locals 1",
                                    "const/4 v0, 0x0",
                                    "sput-boolean v0, Luz/myid/android/sdk/capture/core/MyIdStore;->raspEmulatorDetected:Z",
                                    "return-void",
                                ],
                            },
                        ],
                    },
                ],
            },
        );

        assert.strictEqual(result.changed, true);
        const decision = result.methodResults.find(
            (entry) => entry.methodName === "setRaspEmulatorDetected",
        );
        assert.ok(decision);
        assert.strictEqual(decision?.status, "patched");
    });

    it("is idempotent on already patched MyID getter", function () {
        const smali = [
            ".class public Luz/myid/android/sdk/capture/core/MyIdStore;",
            ".super Ljava/lang/Object;",
            "",
            ".method public final getRaspDebugDetected()Z",
            "    .locals 1",
            "",
            "    const/4 v0, 0x0",
            "",
            "    return v0",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchSmaliContent(
            smali,
            "MyIdStore.smali",
            {
                id: "myid-sdk",
                displayName: "MyID SDK",
                detectionClasses: ["uz/myid/android/sdk/capture/core/MyIdStore"],
                classPatches: [
                    {
                        className: "uz/myid/android/sdk/capture/core/MyIdStore",
                        methods: [
                            {
                                name: "MyIdStore#getRaspDebugDetected",
                                signature: "getRaspDebugDetected()Z",
                                replacementLines: [
                                    ".locals 1",
                                    "const/4 v0, 0x0",
                                    "return v0",
                                ],
                            },
                        ],
                    },
                ],
            },
        );

        assert.strictEqual(result.changed, false);
        const decision = result.methodResults.find(
            (entry) => entry.methodName === "getRaspDebugDetected",
        );
        assert.ok(decision);
        assert.strictEqual(decision?.status, "skipped");
        assert.strictEqual(decision?.reason, "already-patched");
    });

    it("does not patch unrelated classes", function () {
        const smali = [
            ".class public Lcom/example/Utility;",
            ".super Ljava/lang/Object;",
            "",
            ".method public isRooted()Z",
            "    .locals 1",
            "    const/4 v0, 0x1",
            "    return v0",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchSmaliContent(smali, "Utility.smali");

        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.methodResults.length, 0);
    });

    it("patches direct root detection string constants in const-string instructions", function () {
        const smali = [
            ".class public Lcom/example/RootCheck;",
            ".super Ljava/lang/Object;",
            "",
            ".method public isRooted()Z",
            "    .locals 2",
            "    const-string v0, \"su\"",
            "    const-string v1, \"test-keys\"",
            "    const/4 v0, 0x1",
            "    return v0",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchStringConstantsContent(
            smali,
            "RootCheck.smali",
        );

        assert.strictEqual(result.changed, true);
        assert.ok(result.content.includes('const-string v0, "pu"'));
        assert.ok(result.content.includes('const-string v1, "pest-keys"'));
        assert.strictEqual(result.methodResults.length, 2);
        assert.strictEqual(
            result.methodResults[0]?.reason,
            "string-constant-root-mutation",
        );
    });

    it("patches emulator and vpn string constants in const-string instructions", function () {
        const smali = [
            ".class public Lcom/example/DeviceCheck;",
            ".super Ljava/lang/Object;",
            "",
            ".method public isEmulator()Z",
            "    .locals 2",
            "    sget-object v2, Landroid/os/Build;->MODEL:Ljava/lang/String;",
            "    const-string v0, \"goldfish\"",
            "    const-string v2, \"Emulator\"",
            "    const-string v1, \"tun0\"",
            "    const/4 v0, 0x1",
            "    return v0",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchStringConstantsContent(
            smali,
            "DeviceCheck.smali",
        );

        assert.strictEqual(result.changed, true);
        assert.ok(result.content.includes('const-string v0, "poldfish"'));
        assert.ok(result.content.includes('const-string v2, "Pmulator"'));
        assert.ok(result.content.includes('const-string v1, "pun0"'));
    });

    it("patches shell channel strings only inside shell-based checker methods", function () {
        const smali = [
            ".class public LyG;",
            ".super Ljava/lang/Object;",
            "",
            ".method public final check()Ljava/lang/String;",
            "    .locals 3",
            "    const-string v0, \"sh\"",
            "    const-string v1, \"stdout\"",
            "    const-string v2, \"stderr\"",
            "    invoke-virtual {p0, v0}, Ljava/lang/Runtime;->exec(Ljava/lang/String;)Ljava/lang/Process;",
            "    return-object v1",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchStringConstantsContent(smali, "yG.smali");

        assert.strictEqual(result.changed, true);
        assert.ok(result.content.includes('const-string v0, "ph"'));
        assert.ok(result.content.includes('const-string v1, "ptdout"'));
        assert.ok(result.content.includes('const-string v2, "ptderr"'));
    });

    it("patches root path constants inside list-builder detector methods", function () {
        const smali = [
            ".class public LyG;",
            ".super Ljava/lang/Object;",
            "",
            ".method public final collect(Ljava/util/ArrayList;Ljava/util/ArrayList;)V",
            "    .locals 3",
            "    const-string v0, \"/magisk/.core/bin/su\"",
            "    invoke-virtual {p1, v0}, Ljava/util/ArrayList;->contains(Ljava/lang/Object;)Z",
            "    move-result v1",
            "    if-nez v1, :cond_0",
            "    invoke-virtual {p0, p2, v0}, LyG;->do(Ljava/util/ArrayList;Ljava/lang/String;)V",
            "    :cond_0",
            "    return-void",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchStringConstantsContent(smali, "yG.smali");

        assert.strictEqual(result.changed, true);
        assert.ok(
            result.content.includes('const-string v0, "/pagisk/.core/bin/pu"'),
        );
        assert.strictEqual(
            result.methodResults[0]?.reason,
            "string-constant-root-mutation",
        );
    });

    it("does not patch non-listed string constants", function () {
        const smali = [
            ".class public Lcom/example/Feature;",
            ".super Ljava/lang/Object;",
            "",
            ".method public getName()Ljava/lang/String;",
            "    .locals 1",
            "    const-string v0, \"hello\"",
            "    return-object v0",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchStringConstantsContent(smali, "Feature.smali");

        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.methodResults.length, 0);
    });

    it("does not patch excluded framework namespaces for string mutation", function () {
        const smali = [
            ".class public Lcom/google/android/gms/internal/consent_sdk/zzbx;",
            ".super Ljava/lang/Object;",
            "",
            ".method public static do()Z",
            "    .locals 2",
            "    sget-object v0, Landroid/os/Build;->MODEL:Ljava/lang/String;",
            "    const-string v1, \"Emulator\"",
            "    invoke-virtual {v0, v1}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z",
            "    move-result v0",
            "    return v0",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchStringConstantsContent(smali, "zzbx.smali");

        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.methodResults.length, 0);
    });

    it("does not patch generic words outside detector-style methods", function () {
        const smali = [
            ".class public Lcom/example/Feature;",
            ".super Ljava/lang/Object;",
            "",
            ".method public getStatus()Ljava/lang/String;",
            "    .locals 1",
            "    const-string v0, \"unknown\"",
            "    return-object v0",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchStringConstantsContent(smali, "Feature.smali");

        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.methodResults.length, 0);
    });

    it("does not patch shell channel strings outside shell-based detector methods", function () {
        const smali = [
            ".class public Lcom/example/Logger;",
            ".super Ljava/lang/Object;",
            "",
            ".method public log()Ljava/lang/String;",
            "    .locals 2",
            "    const-string v0, \"stdout\"",
            "    const-string v1, \"stderr\"",
            "    return-object v0",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchStringConstantsContent(smali, "Logger.smali");

        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.methodResults.length, 0);
    });

    it("preserves param and annotation metadata while patching", function () {
        const smali = [
            ".class public Luz/myid/android/sdk/capture/core/MyIdStore;",
            ".super Ljava/lang/Object;",
            "",
            ".method public final setRaspRootDetected(Z)V",
            "    .param p1, \"value\"    # Z",
            "    .annotation runtime Lkotlin/jvm/JvmName;",
            "        name = \"setRaspRootDetected\"",
            "    .end annotation",
            "",
            "    .locals 1",
            "    return-void",
            ".end method",
            "",
        ].join("\n");

        const result = rootBypass.patchSmaliContent(
            smali,
            "MyIdStore.smali",
            {
                id: "myid-sdk",
                displayName: "MyID SDK",
                detectionClasses: ["uz/myid/android/sdk/capture/core/MyIdStore"],
                classPatches: [
                    {
                        className: "uz/myid/android/sdk/capture/core/MyIdStore",
                        methods: [
                            {
                                name: "MyIdStore#setRaspRootDetected",
                                signature: "setRaspRootDetected(Z)V",
                                replacementLines: [
                                    ".locals 1",
                                    "const/4 v0, 0x0",
                                    "sput-boolean v0, Luz/myid/android/sdk/capture/core/MyIdStore;->raspRootDetected:Z",
                                    "return-void",
                                ],
                            },
                        ],
                    },
                ],
            },
        );

        assert.strictEqual(result.changed, true);
        assert.ok(result.content.includes(".param p1, \"value\""));
        assert.ok(result.content.includes(".annotation runtime Lkotlin/jvm/JvmName;"));
        assert.ok(
            result.content.includes(
                "sput-boolean v0, Luz/myid/android/sdk/capture/core/MyIdStore;->raspRootDetected:Z",
            ),
        );
    });

    it("validates structure with balanced method blocks", function () {
        const invalidSmali = [
            ".class public Lcom/example/Broken;",
            ".super Ljava/lang/Object;",
            "",
            ".method public isRooted()Z",
            "    .locals 1",
            "    const/4 v0, 0x0",
            "    return v0",
            "",
        ].join("\n");

        assert.strictEqual(rootBypass.validateSmaliStructure(invalidSmali), false);
    });
});
