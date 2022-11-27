import fs from 'fs'
import path from 'path'
import {parseArgsStringToArgv} from 'string-argv'
import {GRADLE_TO_EXECUTE, executeGradleBuild} from '../../src/execution'
import {CacheCleaner} from '../../src/cache-cleaner'
import * as gradlew from '../../src/gradlew'

jest.setTimeout(120000)

let state: Record<string, string> = {}

jest.mock('@actions/core', () => {
    const core = jest.requireActual('@actions/core')

    return {
        __esModule: true,
        ...core,
        saveState: (name: string, value: any) => {
            core.saveState(name, value)
            state[name] = value
        },
        getState: (name: string) => {
            core.getState(name)
            return state[name]
        }
    }
})

test('will cleanup unused dependency jars and build-cache entries', async () => {
    const projectRoot = prepareTestProject()
    const gradleUserHome = path.resolve(projectRoot, 'HOME')
    const tmpDir = path.resolve(projectRoot, 'tmp')
    const cacheCleaner = new CacheCleaner(gradleUserHome, tmpDir)

    await runGradleBuild(projectRoot, 'build', '3.1')

    await cacheCleaner.prepare()

    await runGradleBuild(projectRoot, 'build', '3.1.1')

    const commonsMath31 = path.resolve(
        gradleUserHome,
        'caches/modules-2/files-2.1/org.apache.commons/commons-math3/3.1'
    )
    const commonsMath311 = path.resolve(
        gradleUserHome,
        'caches/modules-2/files-2.1/org.apache.commons/commons-math3/3.1.1'
    )
    const buildCacheDir = path.resolve(gradleUserHome, 'caches/build-cache-1')

    expect(fs.existsSync(commonsMath31)).toBe(true)
    expect(fs.existsSync(commonsMath311)).toBe(true)
    expect(fs.readdirSync(buildCacheDir).length).toBe(4)

    await cacheCleaner.forceCleanup()

    expect(fs.existsSync(commonsMath31)).toBe(false)
    expect(fs.existsSync(commonsMath311)).toBe(true)
    expect(fs.readdirSync(buildCacheDir).length).toBe(3)
})

test('will cleanup unused gradle versions', async () => {
    const projectRoot = prepareTestProject()
    const gradleUserHome = path.resolve(projectRoot, 'HOME')
    const tmpDir = path.resolve(projectRoot, 'tmp')
    const cacheCleaner = new CacheCleaner(gradleUserHome, tmpDir)

    // Initialize HOME with 2 different Gradle versions
    await runGradleWrapperBuild(projectRoot, 'build')
    await runGradleBuild(projectRoot, 'build')

    await cacheCleaner.prepare()

    // Run with only one of these versions
    await runGradleBuild(projectRoot, 'build')

    const gradle733 = path.resolve(gradleUserHome, 'caches/7.3.3')
    const wrapper733 = path.resolve(gradleUserHome, 'wrapper/dists/gradle-7.3.3-bin')
    const gradleCurrent = path.resolve(gradleUserHome, 'caches/7.5.1')

    expect(fs.existsSync(gradle733)).toBe(true)
    expect(fs.existsSync(wrapper733)).toBe(true)
    expect(fs.existsSync(gradleCurrent)).toBe(true)

    await cacheCleaner.forceCleanup()

    expect(fs.existsSync(gradle733)).toBe(false)
    expect(fs.existsSync(wrapper733)).toBe(false)
    expect(fs.existsSync(gradleCurrent)).toBe(true)
})

test('will cleanup when only using wrapper', async () => {
    const projectRoot = prepareTestProject()
    const gradleUserHome = path.resolve(projectRoot, 'HOME')
    const tmpDir = path.resolve(projectRoot, 'tmp')
    const cacheCleaner = new CacheCleaner(gradleUserHome, tmpDir)

    await runGradleWrapperBuild(projectRoot, 'build', '3.1')

    await cacheCleaner.prepare()

    await runGradleWrapperBuild(projectRoot, 'build', '3.1.1')

    const commonsMath31 = path.resolve(
        gradleUserHome,
        'caches/modules-2/files-2.1/org.apache.commons/commons-math3/3.1'
    )
    const commonsMath311 = path.resolve(
        gradleUserHome,
        'caches/modules-2/files-2.1/org.apache.commons/commons-math3/3.1.1'
    )
    const buildCacheDir = path.resolve(gradleUserHome, 'caches/build-cache-1')

    expect(fs.existsSync(commonsMath31)).toBe(true)
    expect(fs.existsSync(commonsMath311)).toBe(true)
    expect(fs.readdirSync(buildCacheDir).length).toBe(4)

    await cacheCleaner.forceCleanup()

    expect(fs.existsSync(commonsMath31)).toBe(false)
    expect(fs.existsSync(commonsMath311)).toBe(true)
    expect(fs.readdirSync(buildCacheDir).length).toBe(3)
})

async function runGradleBuild(projectRoot: string, args: string, version: string = '3.1'): Promise<void> {
    const toExecute = 'gradle'
    state[GRADLE_TO_EXECUTE] = toExecute
    await executeGradleBuild(
        toExecute,
        projectRoot,
        parseArgsStringToArgv(`-g HOME --no-daemon --build-cache -Dcommons_math3_version=${version} ${args}`)
    )
    console.log(`Gradle User Home initialized with commons_math3_version=${version} ${args}`)
}

async function runGradleWrapperBuild(projectRoot: string, args: string, version: string = '3.1'): Promise<void> {
    const toExecute = gradlew.locateGradleWrapperScript(projectRoot)
    state[GRADLE_TO_EXECUTE] = toExecute
    await executeGradleBuild(
        toExecute,
        projectRoot,
        parseArgsStringToArgv(`-g HOME --no-daemon --build-cache -Dcommons_math3_version=${version} ${args}`)
    )
    console.log(`Gradle User Home initialized with commons_math3_version=${version} ${args}`)
}

function prepareTestProject(): string {
    const projectRoot = 'test/jest/resources/cache-cleanup'
    fs.rmSync(path.resolve(projectRoot, 'HOME'), {recursive: true, force: true})
    fs.rmSync(path.resolve(projectRoot, 'tmp'), {recursive: true, force: true})
    fs.rmSync(path.resolve(projectRoot, 'build'), {recursive: true, force: true})
    fs.rmSync(path.resolve(projectRoot, '.gradle'), {recursive: true, force: true})
    return projectRoot
}
