class FallFight {
    constructor() {
        this.socket = io();
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.players = new Map();
        this.blocks = new Map();
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };
        this.currentRoom = null;
        
        this.setupSocketListeners();
        this.setupEventListeners();
    }

    setupSocketListeners() {
        // Room update handler
        this.socket.on('roomUpdate', (data) => {
            this.currentRoom = data;
            this.updateWaitingRoom(data);
        });

        // Game start handler
        this.socket.on('gameStart', (data) => {
            this.startGame(data);
        });

        // Error handler
        this.socket.on('error', (error) => {
            console.error('Server error:', error);
            alert(error.message);
        });

        // Player movement handler
        this.socket.on('playerMoved', (data) => {
            this.updatePlayerPosition(data);
        });

        // Block broken handler
        this.socket.on('blockBroken', (data) => {
            this.handleBlockBroken(data);
        });
    }

    updateWaitingRoom(data) {
        const playersList = document.getElementById('waiting-players-list');
        const playersNeeded = document.getElementById('players-needed');
        
        // Update players list
        playersList.innerHTML = data.players
            .map(player => `<li>${player.username}</li>`)
            .join('');
        
        // Update players needed
        playersNeeded.textContent = data.playersNeeded;
    }

    startGame(data) {
        // Hide waiting screen and show game screen
        document.getElementById('waiting-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        
        // Initialize the game
        this.init();
        
        // Set up players
        data.players.forEach(player => {
            if (player.id !== this.socket.id) {
                this.addPlayer(player);
            }
        });
    }

    init() {
        // Initialize Three.js scene
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('game-canvas'),
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Set up initial camera position
        this.camera.position.set(0, 10, 10);
        this.camera.lookAt(0, 0, 0);

        // Add basic lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        this.scene.add(directionalLight);

        // Create initial game board
        this.createGameBoard();

        // Start render loop
        this.animate();
    }

    createGameBoard() {
        // Create a 30x30 grid of blocks
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0x808080 });

        for (let x = -15; x < 15; x++) {
            for (let z = -15; z < 15; z++) {
                const block = new THREE.Mesh(geometry, material);
                block.position.set(x, 0, z);
                this.scene.add(block);
                this.blocks.set(`${x},${z}`, block);
            }
        }
    }

    setupEventListeners() {
        // Window resize handler
        window.addEventListener('resize', () => {
            if (this.camera && this.renderer) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        });

        // Login form handling
        const playButton = document.getElementById('play-button');
        const usernameInput = document.getElementById('username');

        playButton.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            if (username) {
                this.joinGame(username);
            }
        });

        // Also allow Enter key to submit
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const username = usernameInput.value.trim();
                if (username) {
                    this.joinGame(username);
                }
            }
        });

        // Game controls
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('click', (e) => this.handleClick(e));
    }

    handleKeyDown(event) {
        switch(event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.controls.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.controls.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.controls.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.controls.right = true;
                break;
            case 'Space':
                this.controls.jump = true;
                break;
            case 'Escape':
                this.toggleMenu();
                break;
        }
    }

    handleKeyUp(event) {
        switch(event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.controls.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.controls.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.controls.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.controls.right = false;
                break;
            case 'Space':
                this.controls.jump = false;
                break;
        }
    }

    handleMouseMove(event) {
        // TODO: Implement mouse look controls
    }

    handleClick(event) {
        // TODO: Implement block breaking
    }

    joinGame(username) {
        // Hide login screen and show waiting screen
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('waiting-screen').classList.remove('hidden');
        
        // Emit join event to server
        this.socket.emit('joinGame', username);
    }

    toggleMenu() {
        const menuScreen = document.getElementById('menu-screen');
        menuScreen.classList.toggle('hidden');
    }

    handleBlockBroken(data) {
        const block = this.blocks.get(`${data.x},${data.z}`);
        if (block) {
            this.scene.remove(block);
            this.blocks.delete(`${data.x},${data.z}`);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update game logic here
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize game when the page loads
window.addEventListener('load', () => {
    new FallFight();
}); 