// index.js

const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');
const readlineSync = require('readline-sync');
const consoleClear = require('console-clear');
const figlet = require('figlet');
const colors = require('colors');

// Configuration
const intro = 'QUERY ID Tool';
const telegramAPIsPath = path.join(__dirname, 'TelegramAPIs.json');
const sessionsDir = path.join(__dirname, 'sessions');

// Ensure sessions directory exists
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

// Function to display banner
function displayBanner() {
    consoleClear();
    console.log(
        colors.blue(
            figlet.textSync(intro, {
                horizontalLayout: 'default',
                verticalLayout: 'default'
            })
        )
    );
    console.log(colors.blue('👋 Hello! Welcome to Auto QueryId Requester BOT'));
    console.log(colors.blue('🤝 This tool was created by Naeaex - github.com/Naeaerc20 - x.com/naeaex_dex\n'));
}

// Function to load accounts from TelegramAPIs.json
function loadAccounts() {
    if (!fs.existsSync(telegramAPIsPath)) {
        console.error(colors.red('TelegramAPIs.json file not found.'));
        process.exit(1);
    }

    const data = fs.readFileSync(telegramAPIsPath, 'utf8');
    let accounts;
    try {
        accounts = JSON.parse(data);
    } catch (error) {
        console.error(colors.red('Error parsing TelegramAPIs.json:'), error.message);
        process.exit(1);
    }

    return accounts;
}

// Function to prompt user input
function promptInput(promptText) {
    return readlineSync.question(colors.magenta(promptText));
}

// Function to login using phone number
async function loginWithPhoneNumber(account) {
    const { id, api_id, api_hash, phone_number } = account;
    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, parseInt(api_id), api_hash, { connectionRetries: 5 });

    console.log(colors.yellow(`Logging in account ID: ${id}, Phone: ${phone_number}`));

    try {
        await client.start({
            phoneNumber: async () => phone_number,
            phoneCode: async () => promptInput('Enter the code you received: '),
            password: async () => promptInput('Enter your password (if required): '),
            onError: (err) => console.error(colors.red('Login Error:'), err)
        });

        console.log(colors.green(`Logged in successfully for account ID: ${id}`));

        const sessionString = client.session.save();
        const sessionFile = path.join(sessionsDir, `${id}_session`);

        fs.writeFileSync(sessionFile, sessionString, 'utf8');
        console.log(colors.green(`Session saved to ${sessionFile}`));

        return { client, id, phone_number };
    } catch (error) {
        console.error(colors.red(`Failed to login for account ID: ${id}`), error.message);
        return null;
    }
}

// Function to login using session file
async function loginWithSessionFile(account) {
    const { id, api_id, api_hash, phone_number } = account;
    const sessionFile = path.join(sessionsDir, `${id}_session`);

    if (!fs.existsSync(sessionFile)) {
        console.log(colors.yellow(`Session file not found for account ID: ${id}. Initiating login with phone number.`));
        return await loginWithPhoneNumber(account);
    }

    const sessionData = fs.readFileSync(sessionFile, 'utf8').trim();

    if (!sessionData) {
        console.log(colors.yellow(`Session file is empty for account ID: ${id}. Initiating login with phone number.`));
        return await loginWithPhoneNumber(account);
    }

    const stringSession = new StringSession(sessionData);
    const client = new TelegramClient(stringSession, parseInt(api_id), api_hash, { connectionRetries: 5 });

    console.log(colors.yellow(`Logging in using session for account ID: ${id}, Phone: ${phone_number}`));

    try {
        await client.start();
        console.log(colors.green(`Logged in successfully using session for account ID: ${id}`));
        return { client, id, phone_number };
    } catch (error) {
        console.error(colors.red(`Failed to login using session for account ID: ${id}`), error.message);
        console.log(colors.yellow(`Attempting login with phone number for account ID: ${id}.`));
        return await loginWithPhoneNumber(account);
    }
}

// Function to request WebView and extract tgWebAppData
async function requestWebViewForClient(client, botPeer, webViewURL) {
    try {
        const result = await client.invoke(
            new Api.messages.RequestWebView({
                peer: botPeer,
                bot: botPeer,
                fromBotMenu: false,
                url: webViewURL,
                platform: 'android'
            })
        );

        if (!result || !result.url) {
            throw new Error('No URL returned from RequestWebView.');
        }

        const urlFragment = result.url.split('#')[1];
        if (!urlFragment) {
            throw new Error('URL does not contain a fragment.');
        }

        const params = new URLSearchParams(urlFragment);
        const tgWebAppDataEncoded = params.get('tgWebAppData');

        if (!tgWebAppDataEncoded) {
            throw new Error('tgWebAppData not found in URL fragment.');
        }

        // Return the encoded tgWebAppData
        return tgWebAppDataEncoded;
    } catch (error) {
        console.error(colors.red('Error requesting WebView:'), error.message);
        return null;
    }
}

// Function to handle Request WebView option
async function handleRequestWebView() {
    const accountsData = loadAccounts();
    const loggedInAccounts = [];

    // Login each account
    for (const account of accountsData) {
        const accountInfo = await loginWithSessionFile(account);
        if (accountInfo) {
            loggedInAccounts.push(accountInfo);
        }
    }

    if (loggedInAccounts.length === 0) {
        console.error(colors.red('No accounts are logged in. Returning to main menu.'));
        return;
    }

    // Prompt for Bot_peer and WebViewURL
    const botPeer = promptInput('Enter the Bot_peer (e.g., @YourBot): ').trim();
    const webViewURL = promptInput('Enter the WebView URL: ').trim();

    if (!botPeer || !webViewURL) {
        console.error(colors.red('Bot_peer and WebView URL are required. Returning to main menu.'));
        return;
    }

    const dataList = [];

    // Request WebView for each account
    for (const account of loggedInAccounts) {
        console.log(colors.blue(`\nProcessing account ID: ${account.id}, Phone: ${account.phone_number}`));
        const tgWebAppData = await requestWebViewForClient(account.client, botPeer, webViewURL);

        if (tgWebAppData) {
            dataList.push({
                id: account.id,
                query_id: tgWebAppData // Save the full tgWebAppData as query_id
            });
            console.log(colors.green(`✅ QueryId successfully requested & saved for Account ID: ${account.id} - Phone: ${account.phone_number}`));
        } else {
            console.log(colors.red(`Failed to extract tgWebAppData for account ID: ${account.id}`));
        }
    }

    if (dataList.length === 0) {
        console.error(colors.red('No queryIds were extracted. Returning to main menu.'));
        return;
    }

    // Prompt to choose file format
    const convertToProcessed = promptInput('Do you want to save the data in a processed format? (y/n): ').trim().toLowerCase();

    // Prepare output file names
    const sanitizedBotPeer = botPeer.replace('@', '');
    let outputFileName = '';
    let dataToSave = null;

    if (convertToProcessed === 'y') {
        // Processed format: JSON array of queryIds
        dataToSave = dataList.map(item => item.query_id);
        outputFileName = `${sanitizedBotPeer}_processed_queryIds.json`;
    } else {
        // Default format: JSON array of objects with id and query_id
        dataToSave = dataList;
        outputFileName = `${sanitizedBotPeer}_queryIds.json`;
    }

    const outputPath = path.join(__dirname, outputFileName);

    // Save the data to the selected file format
    try {
        fs.writeFileSync(outputPath, JSON.stringify(dataToSave, null, 4), 'utf8');
        if (convertToProcessed === 'y') {
            console.log(colors.green(`\nProcessed queryIds have been saved to ${outputFileName}\n`));
        } else {
            console.log(colors.green(`\nQueryIds have been saved to ${outputFileName}\n`));
        }
    } catch (error) {
        console.error(colors.red('Error writing to output file:'), error.message);
    }

    // Disconnect all clients
    for (const account of loggedInAccounts) {
        try {
            await account.client.disconnect();
            console.log(colors.yellow(`Disconnected account ID: ${account.id}`));
        } catch (error) {
            console.error(colors.red(`Error disconnecting account ID: ${account.id}`), error.message);
        }
    }

    console.log(colors.green('All operations completed successfully.\n'));
}

// Main Function
async function main() {
    while (true) {
        displayBanner();

        // Submenu
        console.log('1. Request WebView (queryId)');
        console.log('0. Exit');

        const choice = readlineSync.question('Please select an option: ').trim();
        console.log('');

        if (choice === '1') {
            await handleRequestWebView();
            promptInput('Press Enter to return to the main menu...');
        } else if (choice === '0') {
            console.log(colors.green('Exiting the application. Goodbye!'));
            process.exit(0);
        } else {
            console.log(colors.red('Invalid option. Please try again.\n'));
            promptInput('Press Enter to continue...');
        }
    }
}

main();
