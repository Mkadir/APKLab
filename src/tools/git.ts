import * as fs from "fs";
import * as path from "path";
import { outputChannel } from "../data/constants";
import { executeProcess } from "../utils/executor";
import { execSync } from "child_process";

export namespace git {
    /**
     * Returns the value of a git config key, or undefined if not set.
     */
    function getGitConfig(key: string): string | undefined {
        try {
            return execSync(`git config --global ${key}`, {
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
            }).trim();
        } catch {
            return undefined;
        }
    }

    /**
     * Initialize a directory as **Git** repository.
     * @param projectDir project output dir for decode/decompile/analysis.
     * @param commitMsg Message for initial commit.
     */
    export async function initGitDir(
        projectDir: string,
        commitMsg: string,
    ): Promise<void> {
        if (!projectDir || !fs.existsSync(projectDir)) {
            outputChannel.appendLine(
                `Error: Project directory does not exist: ${projectDir}`,
            );
            return;
        }

        if (!commitMsg || commitMsg.trim().length === 0) {
            commitMsg = "Initial commit";
        }

        try {
            // .gitignore content - ignore build artifacts
            const gitignore = "/build\n/dist\n";
            await fs.promises.writeFile(
                path.join(projectDir, ".gitignore"),
                gitignore,
            );

            // Initialize git repository
            const originalDir = process.cwd();

            try {
                process.chdir(projectDir);

                // Check whether a git identity is configured globally.
                // If not, set a local fallback so the initial commit succeeds
                // without requiring the user to configure git globally.
                const hasEmail = getGitConfig("user.email");
                const hasName = getGitConfig("user.name");

                let initCmd = `git init && git config core.safecrlf false`;

                if (!hasEmail) {
                    outputChannel.appendLine(
                        `Warning: git user.email not set globally — using fallback for initial commit.`,
                    );
                    initCmd += ` && git config user.email "hexlab@local"`;
                }

                if (!hasName) {
                    outputChannel.appendLine(
                        `Warning: git user.name not set globally — using fallback for initial commit.`,
                    );
                    initCmd += ` && git config user.name "HexLab"`;
                }

                initCmd += ` && git add -A && git commit -q -m "${commitMsg}"`;

                const report = `Initializing ${projectDir} as Git repository`;
                await executeProcess({
                    name: "Initializing Git",
                    report: report,
                    command: initCmd,
                    args: [],
                    shell: true,
                });
            } finally {
                // Always restore original directory, even on error
                process.chdir(originalDir);
            }
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : String(err);
            outputChannel.appendLine(
                `Error: Initializing project dir as Git repository: ${errorMessage}`,
            );
            outputChannel.appendLine(
                `Tip: Run "git config --global user.email 'you@example.com'" and ` +
                `"git config --global user.name 'Your Name'" to set your git identity.`,
            );
        }
    }
}
