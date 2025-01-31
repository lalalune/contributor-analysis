import { Octokit } from '@octokit/rest';
import { subDays, formatISO } from 'date-fns';

// GraphQL queries
const queries = {
    getPrQuery: (owner, repo, cursor = null) => `
        query${cursor ? '($endCursor: String!)' : ''} {
            repository(owner: "${owner}", name: "${repo}") {
                pullRequests(
                    first: 100,
                    ${cursor ? 'after: $endCursor,' : ''}
                    orderBy: {field: CREATED_AT, direction: DESC}
                    states: [OPEN, CLOSED, MERGED]
                ) {
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                    nodes {
                        id
                        number
                        title
                        body
                        state
                        merged
                        createdAt
                        updatedAt
                        author { 
                            login 
                            avatarUrl
                        }
                        labels(first: 30) { nodes { id name color description } }
                        comments(first: 30) { nodes { id author { login } body } }
                        reviews(first: 30) { nodes { id author { login } body state } }
                        files(first: 100) { nodes { path additions deletions } }
                    }
                }
            }
        }`,

    getIssueQuery: (owner, repo, cursor = null) => `
        query${cursor ? '($endCursor: String!)' : ''} {
            repository(owner: "${owner}", name: "${repo}") {
                issues(
                    first: 100,
                    ${cursor ? 'after: $endCursor,' : ''}
                    orderBy: {field: CREATED_AT, direction: DESC}
                    states: [OPEN, CLOSED]
                ) {
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                    nodes {
                        id
                        number
                        title
                        body
                        state
                        createdAt
                        updatedAt
                        author {
                            login
                            avatarUrl
                        }
                        labels(first: 30) { nodes { id name color description } }
                        comments(first: 30) { nodes { id author { login } body } }
                    }
                }
            }
        }`,

    getCommitQuery: (owner, repo, cursor = null) => `
        query${cursor ? '($endCursor: String!)' : ''} {
            repository(owner: "${owner}", name: "${repo}") {
                defaultBranchRef {
                    target {
                        ... on Commit {
                            history(
                                first: 100
                                ${cursor ? 'after: $endCursor' : ''}
                            ) {
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                                nodes {
                                    sha: oid
                                    message
                                    committedDate
                                    author {
                                        user {
                                            login
                                        }
                                    }
                                    additions
                                    deletions
                                    changedFiles
                                }
                            }
                        }
                    }
                }
            }
        }`
};

/**
 * Execute GitHub GraphQL API query
 * @param {Octokit} octokit - Octokit instance
 * @param {string} query - GraphQL query
 * @param {Object} variables - Query variables
 * @returns {Promise<Object>} Query result
 */
async function executeGitHubQuery(octokit, query, variables = {}) {
    try {
        const result = await octokit.graphql(query, variables);
        return result;
    } catch (error) {
        console.error('Error executing GitHub query:', error);
        throw error;
    }
}

/**
 * Fetch pull requests with pagination
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} startDate - Start date in ISO format
 * @returns {Promise<Array>} Filtered pull requests
 */
async function fetchPRs(octokit, owner, repo, startDate) {
    const allPRs = [];
    let hasNext = true;
    let cursor = null;
    let page = 1;

    while (hasNext) {
        console.error(`Fetching PR page ${page}...`);
        
        const query = queries.getPrQuery(owner, repo, cursor);
        const result = await executeGitHubQuery(octokit, query, { endCursor: cursor });
        const prData = result.repository.pullRequests;
        
        // Filter and format PRs
        const filteredPRs = prData.nodes
            .filter(pr => pr.createdAt >= startDate)
            .map(pr => ({
                id: pr.id,
                number: pr.number,
                title: pr.title,
                body: pr.body,
                state: pr.state,
                merged: pr.merged,
                createdAt: pr.createdAt,
                updatedAt: pr.updatedAt,
                author: pr.author ? {
                    login: pr.author.login,
                    avatarUrl: pr.author.avatarUrl
                } : null,
                labels: pr.labels.nodes.map(label => ({
                    id: label.id,
                    name: label.name,
                    color: label.color,
                    description: label.description
                })),
                files: pr.files.nodes.map(file => ({
                    path: file.path,
                    additions: file.additions,
                    deletions: file.deletions
                })),
                reviews: pr.reviews.nodes.map(review => ({
                    id: review.id,
                    author: review.author ? review.author.login : null,
                    body: review.body,
                    state: review.state
                })),
                comments: pr.comments.nodes.map(comment => ({
                    id: comment.id,
                    author: comment.author ? comment.author.login : null,
                    body: comment.body
                }))
            }));

        if (filteredPRs.length === 0) break;
        
        allPRs.push(...filteredPRs);
        hasNext = prData.pageInfo.hasNextPage;
        cursor = prData.pageInfo.endCursor;
        page++;
        
        // Rate limiting pause
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return allPRs;
}

/**
 * Fetch issues with pagination
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} startDate - Start date in ISO format
 * @returns {Promise<Array>} Filtered issues
 */
async function fetchIssues(octokit, owner, repo, startDate) {
    const allIssues = [];
    let hasNext = true;
    let cursor = null;
    let page = 1;

    while (hasNext) {
        console.error(`Fetching issue page ${page}...`);
        
        const query = queries.getIssueQuery(owner, repo, cursor);
        const result = await executeGitHubQuery(octokit, query, { endCursor: cursor });
        const issueData = result.repository.issues;
        
        const filteredIssues = issueData.nodes
            .filter(issue => issue.createdAt >= startDate)
            .map(issue => ({
                id: issue.id,
                number: issue.number,
                title: issue.title,
                body: issue.body,
                state: issue.state,
                createdAt: issue.createdAt,
                updatedAt: issue.updatedAt,
                author: issue.author ? {
                    login: issue.author.login,
                    avatarUrl: issue.author.avatarUrl
                } : null,
                labels: issue.labels.nodes.map(label => ({
                    id: label.id,
                    name: label.name,
                    color: label.color,
                    description: label.description
                })),
                comments: issue.comments.nodes.map(comment => ({
                    id: comment.id,
                    author: comment.author ? comment.author.login : null,
                    body: comment.body
                }))
            }));

        if (filteredIssues.length === 0) break;
        
        allIssues.push(...filteredIssues);
        hasNext = issueData.pageInfo.hasNextPage;
        cursor = issueData.pageInfo.endCursor;
        page++;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return allIssues;
}

/**
 * Fetch commits with pagination
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} startDate - Start date in ISO format
 * @returns {Promise<Array>} Filtered commits
 */
async function fetchCommits(octokit, owner, repo, startDate) {
    const allCommits = [];
    let hasNext = true;
    let cursor = null;
    let page = 1;

    while (hasNext) {
        console.error(`Fetching commit page ${page}...`);
        
        const query = queries.getCommitQuery(owner, repo, cursor);
        const result = await executeGitHubQuery(octokit, query, { endCursor: cursor });
        const commitData = result.repository.defaultBranchRef.target.history;
        
        const filteredCommits = commitData.nodes
            .filter(commit => commit.committedDate >= startDate)
            .map(commit => ({
                sha: commit.sha,
                message: commit.message,
                committedDate: commit.committedDate,
                author: {
                    user: {
                        login: commit.author?.user?.login || null
                    }
                },
                additions: commit.additions,
                deletions: commit.deletions,
                changedFiles: commit.changedFiles
            }));

        if (filteredCommits.length === 0) break;
        
        allCommits.push(...filteredCommits);
        hasNext = commitData.pageInfo.hasNextPage;
        cursor = commitData.pageInfo.endCursor;
        page++;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return allCommits;
}

/**
 * Main function to fetch GitHub data
 * @param {Object} options - Command line options
 */
async function main() {
    const argv = await import('yargs')
        .then(({ default: yargs }) => 
            yargs(process.argv.slice(2))
                .option('type', {
                    describe: 'Type of data to fetch',
                    choices: ['prs', 'issues', 'commits'],
                    demandOption: true
                })
                .option('days', {
                    describe: 'Number of days to look back',
                    type: 'number',
                    default: 7
                })
                .usage('Usage: $0 <owner> <repo> --type <type> [options]')
                .demandCommand(2)
                .argv
        );

    const [owner, repo] = argv._;
    const { type, days } = argv;

    if (!process.env.GITHUB_TOKEN) {
        console.error('Error: GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }

    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });

    const endDate = formatISO(new Date());
    const startDate = formatISO(subDays(new Date(), days));

    console.error(`Fetching ${type} from ${startDate} to ${endDate}`);

    try {
        let result;
        switch (type) {
            case 'prs':
                result = await fetchPRs(octokit, owner, repo, startDate);
                break;
            case 'issues':
                result = await fetchIssues(octokit, owner, repo, startDate);
                break;
            case 'commits':
                result = await fetchCommits(octokit, owner, repo, startDate);
                break;
            default:
                throw new Error(`Invalid type: ${type}. Must be one of: prs, issues, commits`);
        }
        
        // Output result as JSON
        console.log(JSON.stringify(result, null, 2));
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

if (process.argv[1] === import.meta.url) {
    main().catch(console.error);
}

export {
    fetchPRs,
    fetchIssues,
    fetchCommits,
    main
};