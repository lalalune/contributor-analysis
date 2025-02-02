import { exec } from 'child_process';
import { mkdir, writeFile, copyFile, access, stat, readdir } from 'fs/promises';
import { promisify } from 'util';
import { Octokit } from '@octokit/rest';
import { formatISO, subDays } from 'date-fns';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { fetchPRs, fetchIssues, fetchCommits } from './fetch_github.js';
import path from 'path';

console.log('Loading orchestrator.js');

// Load environment variables
dotenv.config();

const execAsync = promisify(exec);

// Configuration
const config = {
    owner: process.env.GITHUB_OWNER || 'elizaos',
    repo: process.env.GITHUB_REPO || 'eliza',
    periods: {
        daily: 1,
        weekly: 7,
        monthly: 30
    }
};

/**
 * Execute shell command with proper error handling
 */
async function runCommand(command, env = {}) {
    try {
        console.log(`\nExecuting command: ${command}`);
        const { stdout, stderr } = await execAsync(command, {
            env: { ...process.env, ...env },
            shell: true,
            // Increase max buffer size in case of large output
            maxBuffer: 1024 * 1024 * 10
        });
        if (stdout) console.log(stdout);
        if (stderr) {
            console.error('Command stderr:');
            console.error(stderr);
        }
        return stdout.trim();
    } catch (error) {
        console.error(`\nError executing command: ${command}`);
        if (error.stdout) console.log('Command stdout:', error.stdout);
        if (error.stderr) console.error('Command stderr:', error.stderr);
        console.error('Error details:', error);
        throw error;
    }
}

/**
 * Create all necessary directories
 */
async function createDirectories() {
    const dirs = [
        'data',
        'data/daily', 'data/daily/history',
        'data/weekly', 'data/weekly/history',
        'data/monthly', 'data/monthly/history'
    ];

    for (const dir of dirs) {
        try {
            await mkdir(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.error(`Error creating directory ${dir}:`, error);
                throw error;
            }
        }
    }
}

/**
 * Get current timestamp in YYYY_MM_DD format
 */
function getTimestamp() {
    const now = new Date();
    return formatISO(now).split('T')[0].replace(/-/g, '_');
}

/**
 * Verify file exists and log its stats
 */
async function verifyFile(filepath) {
    try {
        await access(filepath);
        const stats = await stat(filepath);
        console.log(`Verified ${filepath} exists (${stats.size} bytes)`);
        return true;
    } catch (error) {
        console.error(`File verification failed for ${filepath}:`, error.message);
        return false;
    }
}

/**
 * Fetch GitHub data for a specific period
 */
async function fetchData(period) {
    console.log(`\nStarting fetchData for ${period}...`);
    const timestamp = getTimestamp();
    const days = config.periods[period];
    const baseDir = `data/${period}`;

    if (!process.env.GITHUB_TOKEN) {
        throw new Error('GITHUB_TOKEN environment variable is required');
    }

    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });

    const types = ['prs', 'issues', 'commits'];
    for (const type of types) {
        console.log(`\nFetching ${type}...`);
        try {
            const startDate = formatISO(subDays(new Date(), days));
            
            let data;
            switch (type) {
                case 'prs':
                    data = await fetchPRs(octokit, config.owner, config.repo, startDate);
                    break;
                case 'issues':
                    data = await fetchIssues(octokit, config.owner, config.repo, startDate);
                    break;
                case 'commits':
                    data = await fetchCommits(octokit, config.owner, config.repo, startDate);
                    break;
                default:
                    throw new Error(`Invalid type: ${type}`);
            }

            // Save data
            const currentFile = `${baseDir}/${type}.json`;
            const historyFile = `${baseDir}/history/${type}_${timestamp}.json`;
            const jsonData = JSON.stringify(data, null, 2);

            await writeFile(currentFile, jsonData);
            await writeFile(historyFile, jsonData);

            if (await verifyFile(currentFile)) {
                console.log(`Successfully saved ${data.length} ${type}`);
            }

        } catch (error) {
            console.error(`Error fetching ${type}:`, error);
            throw error;
        }
    }
}

async function processData(period) {
    console.log(`\nProcessing ${period} data...`);
    const timestamp = getTimestamp();
    const baseDir = `data/${period}`;

    // Add debug logging
    console.log('DEBUG: Current working directory:', process.cwd());
    console.log('DEBUG: Base directory:', baseDir);

    try {
        // Ensure the base directory exists
        await mkdir(baseDir, { recursive: true });
        console.log('DEBUG: Created/verified base directory:', baseDir);
        
        // Verify input files exist
        const requiredFiles = ['prs.json', 'issues.json', 'commits.json'];
        for (const file of requiredFiles) {
            const filepath = `${baseDir}/${file}`;
            console.log('DEBUG: Checking for required file:', filepath);
            if (!await verifyFile(filepath)) {
                throw new Error(`Required input file ${filepath} not found`);
            }
        }

        // Process data with better error handling
        console.log('\nRunning combine.js...');
        const combineCommand = `node --experimental-specifier-resolution=node src/combine.js` +
            ` --prs "${baseDir}/prs.json"` +
            ` --issues "${baseDir}/issues.json"` +
            ` --commits "${baseDir}/commits.json"` +
            ` --output "${baseDir}/combined.json"` +
            ` --data-dir "${baseDir}"`;
            
        console.log('DEBUG: Running combine command:', combineCommand);
        try {
            await runCommand(combineCommand);
        } catch (error) {
            console.error('Error running combine.js:', error);
            throw new Error('Failed to execute combine.js');
        }

        // Log what files exist after combine.js
        console.log('DEBUG: Files after combine.js:');
        try {
            const files = await readdir(baseDir);
            console.log(files);
        } catch (e) {
            console.log('Error reading directory:', e);
        }

        if (!await verifyFile(`${baseDir}/combined.json`)) {
            throw new Error('Failed to create combined.json');
        }

        // Calculate scores
        console.log('\nRunning calculate_scores.js...');
        const scoresCommand = `node src/calculate_scores.js "${baseDir}/combined.json" "${baseDir}/scored.json"`;
        console.log('DEBUG: Running scores command:', scoresCommand);
        await runCommand(scoresCommand);
        
        if (!await verifyFile(`${baseDir}/scored.json`)) {
            throw new Error('Failed to create scored.json');
        }

        // Run summarize.js with corrected paths
        console.log('\nRunning summarize.js...');
        await mkdir(baseDir, { recursive: true });

        const absoluteInputPath = path.resolve(process.cwd(), `${baseDir}/scored.json`);
        const absoluteOutputPath = path.resolve(process.cwd(), `${baseDir}/contributors.json`);

        console.log('DEBUG: Input path:', absoluteInputPath);
        console.log('DEBUG: Output path:', absoluteOutputPath);

        const summarizeCommand = `node src/summarize.js --force "${absoluteInputPath}" "${absoluteOutputPath}"`;
        console.log('DEBUG: Running summarize command:', summarizeCommand);
        await runCommand(summarizeCommand);

        // Check output location immediately after summarize.js
        console.log('DEBUG: Checking output locations after summarize.js:');
        console.log(`Checking ${baseDir}/contributors.json`);
        console.log(`Checking ${process.cwd()}/${baseDir}/contributors.json`);
        
        // List all files in relevant directories
        console.log('DEBUG: Files in base directory:');
        try {
            const files = await readdir(baseDir);
            console.log(files);
        } catch (e) {
            console.log('Error reading directory:', e);
        }

        // Verify the file was created
        if (!await verifyFile(`${baseDir}/contributors.json`)) {
            throw new Error('Failed to create contributors.json');
        }

        // Copy contributors file to root data directory with explicit paths
        const sourcePath = `${process.cwd()}/${baseDir}/contributors.json`;
        const destPath = `${process.cwd()}/data/contributors.json`;
        console.log('DEBUG: Copying from:', sourcePath);
        console.log('DEBUG: Copying to:', destPath);
        await copyFile(sourcePath, destPath);
        
        console.log('DEBUG: Verifying copy operation...');
        if (!await verifyFile(destPath)) {
            throw new Error('Failed to copy contributors.json to root data directory');
        }
        console.log('Copied contributors.json to root data directory');

        // Generate summaries for daily data
        if (period === 'daily') {
            console.log('\nGenerating daily summaries...');
            await runCommand(`node src/summarize_daily.js "${baseDir}/contributors.json" -t json "${baseDir}/summary.json"`);
            await runCommand(`node src/summarize_daily.js "${baseDir}/contributors.json" -t md "${baseDir}/summary.md"`);

            // Create history directory if it doesn't exist
            const historyDir = `${baseDir}/history`;
            await mkdir(historyDir, { recursive: true });
            console.log('DEBUG: Created history directory:', historyDir);

            // Backup current files to history with explicit paths
            await copyFile(`${baseDir}/contributors.json`, `${historyDir}/contributors_${timestamp}.json`);
            await copyFile(`${baseDir}/summary.json`, `${historyDir}/summary_${timestamp}.json`);
            await copyFile(`${baseDir}/summary.md`, `${historyDir}/summary_${timestamp}.md`);
        }
    } catch (error) {
        console.error(`Error processing ${period} data:`, error);
        throw error;
    }
}

/**
 * Build and generate the site
 */
async function buildSite() {
    console.log('\nBuilding and generating site...');
    try {
        // Verify contributors.json exists in root data directory
        if (!await verifyFile('data/contributors.json')) {
            throw new Error('contributors.json not found in root data directory');
        }

        await runCommand('npm run build-site');
        await runCommand('npm run generate-site');
    } catch (error) {
        console.error('Error building site:', error);
        throw error;
    }
}

/**
 * Main orchestration function
 */
async function main() {
    console.log('Starting main function...');
    
    const periodArg = process.argv[2];
    const validPeriods = ['daily', 'weekly', 'monthly', 'all'];
    
    if (!periodArg || !validPeriods.includes(periodArg)) {
        console.error(`Please specify a valid period: ${validPeriods.join(', ')}`);
        process.exit(1);
    }

    // Validate environment variables
    if (!process.env.GITHUB_TOKEN) {
        console.error('Error: GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }

    if (!process.env.OPENAI_API_KEY) {
        console.error('Error: OPENAI_API_KEY environment variable is required');
        process.exit(1);
    }

    try {
        await createDirectories();

        const periodsToProcess = periodArg === 'all' 
            ? ['daily', 'weekly', 'monthly']
            : [periodArg];
            
        console.log('Processing periods:', periodsToProcess);

        for (const period of periodsToProcess) {
            await fetchData(period);
            await processData(period);
        }

        await buildSite();
        console.log('\nAll operations completed successfully!');
    } catch (error) {
        console.error('\nError in main execution:', error);
        process.exit(1);
    }
}

// Execute main function if run directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    main().catch(error => {
        console.error('Uncaught error:', error);
        process.exit(1);
    });
}

export {
    fetchData,
    processData,
    buildSite,
    main
};