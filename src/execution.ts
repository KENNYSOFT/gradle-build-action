import * as core from '@actions/core'
import * as exec from '@actions/exec'

export const GRADLE_TO_EXECUTE = 'GRADLE_TO_EXECUTE'

export async function executeGradleBuild(toExecute: string, root: string, args: string[]): Promise<void> {
    const status: number = await exec.exec(toExecute, args, {
        cwd: root,
        ignoreReturnCode: true
    })

    if (status !== 0) {
        core.setFailed(`Gradle build failed: see console output for details`)
    }
}
