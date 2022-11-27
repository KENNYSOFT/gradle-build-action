import * as core from '@actions/core'
import * as path from 'path'
import {parseArgsStringToArgv} from 'string-argv'
import fs from 'fs'

import * as setupGradle from './setup-gradle'
import * as execution from './execution'
import * as provision from './provision'
import * as gradlew from './gradlew'

/**
 * The main entry point for the action, called by Github Actions for the step.
 */
export async function run(): Promise<void> {
    try {
        const workspaceDirectory = process.env[`GITHUB_WORKSPACE`] || ''
        const buildRootDirectory = resolveBuildRootDirectory(workspaceDirectory)

        await setupGradle.setup(buildRootDirectory)

        const executable = await provisionGradle(workspaceDirectory)
        // executable will be undefined if using Gradle wrapper
        if (executable !== undefined) {
            core.addPath(path.dirname(executable))
        }

        // Use the provided executable, or look for a Gradle wrapper script to run
        const toExecute = executable ?? gradlew.locateGradleWrapperScript(buildRootDirectory)
        verifyIsExecutableScript(toExecute)

        // Save determined executable or wrapper script for use in the post-action step.
        core.saveState(execution.GRADLE_TO_EXECUTE, toExecute)

        // Only execute if arguments have been provided
        const args: string[] = parseCommandLineArguments()
        if (args.length > 0) {
            await execution.executeGradleBuild(toExecute, buildRootDirectory, args)
        }
    } catch (error) {
        core.setFailed(String(error))
        if (error instanceof Error && error.stack) {
            core.info(error.stack)
        }
    }
}

run()

async function provisionGradle(workspaceDirectory: string): Promise<string | undefined> {
    const gradleVersion = core.getInput('gradle-version')
    if (gradleVersion !== '' && gradleVersion !== 'wrapper') {
        return path.resolve(await provision.gradleVersion(gradleVersion))
    }

    const gradleExecutable = core.getInput('gradle-executable')
    if (gradleExecutable !== '') {
        return path.resolve(workspaceDirectory, gradleExecutable)
    }

    return undefined
}

function resolveBuildRootDirectory(baseDirectory: string): string {
    const buildRootDirectory = core.getInput('build-root-directory')
    const resolvedBuildRootDirectory =
        buildRootDirectory === '' ? path.resolve(baseDirectory) : path.resolve(baseDirectory, buildRootDirectory)
    return resolvedBuildRootDirectory
}

function verifyIsExecutableScript(toExecute: string): void {
    try {
        fs.accessSync(toExecute, fs.constants.X_OK)
    } catch (err) {
        throw new Error(`Gradle script '${toExecute}' is not executable.`)
    }
}

function parseCommandLineArguments(): string[] {
    const input = core.getInput('arguments')
    return parseArgsStringToArgv(input)
}
