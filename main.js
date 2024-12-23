require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const generateJoke = require('./generateJoke');
const synthesizeSpeech = require('./synthesizeSpeech');
const Store = require('electron-store');
const store = new Store();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.resolve(__dirname, 'preload.js')
        },
        backgroundColor: '#1a1a1a'
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// Ensure output directory exists
async function ensureOutputDir() {
    const outputDir = path.join(__dirname, 'output');
    try {
        await fs.access(outputDir);
    } catch {
        await fs.mkdir(outputDir);
    }
    return outputDir;
}

// Load routine metadata
async function loadRoutineMetadata() {
    const metadataPath = path.join(__dirname, 'output', 'routines.json');
    try {
        const data = await fs.readFile(metadataPath, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Save routine metadata
async function saveRoutineMetadata(routines) {
    const metadataPath = path.join(__dirname, 'output', 'routines.json');
    await fs.writeFile(metadataPath, JSON.stringify(routines, null, 2));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle joke generation
ipcMain.handle('generate', async (_, topics) => {
    try {
        const outputDir = await ensureOutputDir();
        
        // Convert array to string if it's an array, or use the string directly
        const topicString = Array.isArray(topics) ? topics.join(' ') : topics;

        const prompt = `You are a seasoned stand-up comedian performing in a packed New York comedy club. Your style is polished, razor-sharp, and crafted to kill in intimate venues. Think Bill Burr meets Jimmy Carr: a fearless, funny, and whip-smart performer who knows how to work the room with precision and timing.

        Your task:
        - Write a tight, hilarious stand-up routine about: ${topicString}
        
        Guidelines:
        1. **Stage-ready material only**: Write exactly as you'd deliver it on stage—no stage directions, audience reactions, or parentheticals. The focus is 100% on the jokes and delivery.
        2. **Start strong**: Open with a killer hook to grab the room immediately.
        3. **Stay tight**: Keep the pacing snappy—every line should set up or land a laugh.
        4. **Lean into sharp wit**: Use edgy, clever observations and cut right to the funny core of the topic.
        5. **Master tension and release**: Build setups with relatable details, use callbacks to reward the audience, and surprise them with unexpected punchlines.
        6. **Use vivid imagery**: Bring the audience into the joke with colourful language, metaphors, and comparisons that make the material pop.
        7. **Work the room**: Channel the vibe of a comic at their best—confident, loose, and always in control of the energy.
        
        This is your best five minutes—a no-fluff, no-fat routine designed to leave the audience in stitches. Deliver it with the rhythm, sharpness, and timing of a comedy club pro at the top of their game.`;
        
        const jokeText = await generateJoke(prompt);
        const audioPath = await synthesizeSpeech(jokeText);

        // Save routine metadata
        const routines = await loadRoutineMetadata();
        const newRoutine = {
            id: path.basename(audioPath, '.mp3'), // Extract ID from audio filename
            topic: topicString,
            date: new Date().toISOString(),
            audioPath
        };
        routines.unshift(newRoutine);
        await saveRoutineMetadata(routines);

        return { 
            audioPath,
            jokeText 
        };
    } catch (error) {
        console.error('Error generating routine:', error);
        return { error: error.message };
    }
});

// Handle getting routine list
ipcMain.handle('getRoutines', async () => {
    try {
        const routines = await loadRoutineMetadata();
        return { routines };
    } catch (error) {
        console.error('Error loading routines:', error);
        return { error: error.message };
    }
});


ipcMain.handle('saveAudio', async (_, audioPath) => {
    try {
        const savePath = await dialog.showSaveDialog({
            defaultPath: path.basename(audioPath),
            filters: [{ name: 'Audio', extensions: ['mp3'] }]
        });
        
        if (!savePath.canceled) {
            await fs.copyFile(audioPath, savePath.filePath);
            return { success: true };
        }
        return { canceled: true };
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('saveSettings', async (_, settings) => {
    if (!store) {
        const { default: Store } = await import('electron-store');
        store = new Store();
    }
    if (settings.selectedVoice) {
        store.set('selectedVoice', settings.selectedVoice);
    }
    return { success: true };
});

ipcMain.handle('getSettings', async () => {
    if (!store) {
        const { default: Store } = await import('electron-store');
        store = new Store();
    }
    return {
        selectedVoice: store.get('selectedVoice') || 'wLoW00IP5kfH8oiOBAPp',
        groqKey: store.get('groqKey'),
        elevenLabsKey: store.get('elevenLabsKey'),
    };
});


ipcMain.handle('checkApiKeys', async () => {
    return {
      hasGroqKey: !!store.get('groqKey'),
      hasElevenLabsKey: !!store.get('elevenLabsKey')
    };
  });