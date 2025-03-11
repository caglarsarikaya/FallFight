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
        this.playerObject = null;
        this.raycaster = null;
        this.mouse = new THREE.Vector2();
        this.playerSpeed = 0.15;
        this.jumpForce = 0.5;
        this.gravity = 0.015;
        this.velocity = new THREE.Vector3();
        this.isOnGround = false;
        this.isGameStarted = false;
        this.REQUIRED_PLAYERS = 1; // In dev mode, only 1 player is required
        
        this.setupSocketListeners();
        this.setupEventListeners();
    }

    setupSocketListeners() {
        // Room update handler
        this.socket.on('roomUpdate', (data) => {
            console.log('Received room update:', data);
            this.currentRoom = data;
            this.updateWaitingRoom(data);
        });

        // Game start handler
        this.socket.on('gameStart', (data) => {
            console.log('Received game start signal:', data);
            this.startGame(data);
        });

        // Error handler
        this.socket.on('error', (error) => {
            console.error('Server error:', error);
            alert(error.message);
        });

        // Player movement handler
        this.socket.on('playerMoved', (data) => {
            if (!this.isGameStarted) return;
            this.updatePlayerPosition(data);
        });

        // Block broken handler
        this.socket.on('blockBroken', (data) => {
            if (!this.isGameStarted) return;
            this.handleBlockBroken(data);
        });
    }

    updateWaitingRoom(data) {
        console.log('Updating waiting room with data:', data);
        const playersList = document.getElementById('waiting-players-list');
        const playersNeeded = document.getElementById('players-needed');
        
        // Update players list
        playersList.innerHTML = data.players
            .map(player => `<li>${player.nickname}</li>`)
            .join('');
        
        // Update players needed
        const needed = this.REQUIRED_PLAYERS - data.players.length;
        playersNeeded.textContent = needed > 0 ? needed : 'Starting game...';
    }

    startGame(data) {
        if (this.isGameStarted) return;
        
        console.log('Starting game with data:', data);
        
        try {
            // Hide waiting screen and show game screen
            const waitingScreen = document.getElementById('waiting-screen');
            const gameScreen = document.getElementById('game-screen');
            
            console.log('Screens found:', { waitingScreen, gameScreen });
            
            if (waitingScreen) waitingScreen.classList.add('hidden');
            if (gameScreen) gameScreen.classList.remove('hidden');
            
            // Initialize the game
            console.log('Initializing game...');
            this.init();
            
            // Set up players
            console.log('Setting up players:', data.players);
            data.players.forEach(player => {
                if (player.id !== this.socket.id) {
                    this.addPlayer(player);
                }
            });

            // Position players around the arena
            console.log('Positioning players...');
            this.positionPlayers(data.players);
            
            this.isGameStarted = true;
            console.log('Game started successfully');

            // Request pointer lock for mouse control
            const canvas = document.getElementById('game-canvas');
            if (canvas) {
                canvas.requestPointerLock();
            }
        } catch (error) {
            console.error('Error starting game:', error);
        }
    }

    positionPlayers(players) {
        const totalPlayers = players.length;
        players.forEach((player, index) => {
            const angle = (index / totalPlayers) * Math.PI * 2;
            const radius = 10; // Distance from center
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            if (player.id === this.socket.id) {
                // Position local player
                this.playerObject.position.set(x, 2, z);
                this.playerObject.rotation.y = angle + Math.PI; // Face center
            } else {
                // Position other players
                const otherPlayer = this.players.get(player.id);
                if (otherPlayer && otherPlayer.mesh) {
                    otherPlayer.mesh.position.set(x, 2, z);
                    otherPlayer.mesh.rotation.y = angle + Math.PI;
                }
            }
        });
    }

    init() {
        try {
            console.log('Creating Three.js scene...');
            // Initialize Three.js scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background
            
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            
            const canvas = document.getElementById('game-canvas');
            console.log('Found game canvas:', canvas);
            
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true
            });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            
            // Initialize raycaster
            this.raycaster = new THREE.Raycaster();

            // Add basic lighting
            console.log('Adding lights...');
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            this.scene.add(ambientLight);
            
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(10, 20, 10);
            this.scene.add(directionalLight);

            // Create initial game board
            console.log('Creating game board...');
            this.createGameBoard();

            // Create player character
            console.log('Creating player character...');
            this.createPlayerCharacter();

            // Start render loop
            console.log('Starting render loop...');
            this.animate();
        } catch (error) {
            console.error('Error initializing game:', error);
        }
    }

    createGameBoard() {
        try {
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
            console.log('Game board created successfully');
        } catch (error) {
            console.error('Error creating game board:', error);
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
        // Update mouse position for raycaster
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        if (this.playerObject) {
            // Rotate player based on mouse movement
            const sensitivity = 0.002;
            this.playerObject.rotation.y -= event.movementX * sensitivity;
            
            // Update camera position relative to player
            const distance = 8;
            const height = 5;
            const playerPos = this.playerObject.position;
            const angle = this.playerObject.rotation.y;
            
            this.camera.position.x = playerPos.x - Math.sin(angle) * distance;
            this.camera.position.z = playerPos.z - Math.cos(angle) * distance;
            this.camera.position.y = playerPos.y + height;
            this.camera.lookAt(playerPos);
        }
    }

    handleClick(event) {
        if (!this.playerObject || !this.raycaster) return;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for intersections with blocks
        const intersects = this.raycaster.intersectObjects(
            Array.from(this.blocks.values())
        );

        if (intersects.length > 0) {
            const block = intersects[0].object;
            const pos = block.position;
            
            // Emit block breaking event
            this.socket.emit('breakBlock', {
                x: pos.x,
                y: pos.y,
                z: pos.z
            });
        }
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
            // Create breaking animation
            const particles = this.createBreakingParticles(block.position);
            
            // Remove block after delay
            setTimeout(() => {
                this.scene.remove(block);
                this.blocks.delete(`${data.x},${data.z}`);
                
                // Remove particles after animation
                setTimeout(() => {
                    particles.forEach(p => this.scene.remove(p));
                }, 1000);
            }, 250);
        }
    }

    createBreakingParticles(position) {
        const particles = [];
        const particleCount = 8;
        const particleGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const particleMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 });

        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(position);
            
            // Random velocity
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                Math.random() * 0.2,
                (Math.random() - 0.5) * 0.3
            );
            
            this.scene.add(particle);
            particles.push(particle);
        }

        return particles;
    }

    createPlayerCharacter() {
        // Create player mesh
        const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
        this.playerObject = new THREE.Mesh(geometry, material);
        
        // Position player above the blocks
        this.playerObject.position.set(0, 2, 0);
        this.scene.add(this.playerObject);

        // Create axe (simple representation)
        const axeGeometry = new THREE.BoxGeometry(0.1, 0.4, 0.1);
        const axeMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
        const axe = new THREE.Mesh(axeGeometry, axeMaterial);
        axe.position.set(0.4, -0.2, 0);
        this.playerObject.add(axe);

        // Set up camera to follow player
        this.camera.position.set(0, 5, 8);
        this.camera.lookAt(this.playerObject.position);
    }

    addPlayer(player) {
        const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        const playerMesh = new THREE.Mesh(geometry, material);
        
        playerMesh.position.set(0, 2, 0);
        this.scene.add(playerMesh);
        this.players.set(player.id, {
            mesh: playerMesh,
            username: player.username
        });
    }

    updatePlayerPosition(data) {
        const player = this.players.get(data.playerId);
        if (player && player.mesh) {
            player.mesh.position.copy(data.position);
            player.mesh.rotation.copy(data.rotation);
        }
    }

    updatePhysics() {
        if (!this.playerObject) return;

        // Apply gravity
        this.velocity.y -= this.gravity;

        // Check if player is on ground
        this.isOnGround = false;
        const rayStart = this.playerObject.position.clone();
        const rayEnd = rayStart.clone().add(new THREE.Vector3(0, -1, 0));
        const intersects = this.raycaster.intersectObjects(Array.from(this.blocks.values()));
        
        if (intersects.length > 0 && intersects[0].distance < 1.0) {
            this.isOnGround = true;
            this.velocity.y = Math.max(0, this.velocity.y);
            this.playerObject.position.y = intersects[0].point.y + 1.0;
        }

        // Handle movement
        if (this.controls.forward) {
            this.velocity.x -= Math.sin(this.playerObject.rotation.y) * this.playerSpeed;
            this.velocity.z -= Math.cos(this.playerObject.rotation.y) * this.playerSpeed;
        }
        if (this.controls.backward) {
            this.velocity.x += Math.sin(this.playerObject.rotation.y) * this.playerSpeed;
            this.velocity.z += Math.cos(this.playerObject.rotation.y) * this.playerSpeed;
        }
        if (this.controls.left) {
            this.velocity.x -= Math.cos(this.playerObject.rotation.y) * this.playerSpeed;
            this.velocity.z += Math.sin(this.playerObject.rotation.y) * this.playerSpeed;
        }
        if (this.controls.right) {
            this.velocity.x += Math.cos(this.playerObject.rotation.y) * this.playerSpeed;
            this.velocity.z -= Math.sin(this.playerObject.rotation.y) * this.playerSpeed;
        }
        if (this.controls.jump && this.isOnGround) {
            this.velocity.y = this.jumpForce;
        }

        // Apply velocity
        this.playerObject.position.add(this.velocity);

        // Dampen velocity
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;

        // Emit position update
        this.socket.emit('playerMove', {
            position: this.playerObject.position,
            rotation: this.playerObject.rotation
        });

        // Check for fall
        if (this.playerObject.position.y < -2) {
            this.handlePlayerFall();
        }
    }

    handlePlayerFall() {
        // TODO: Implement player elimination
        console.log('Player eliminated!');
        this.socket.emit('playerEliminated');
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.isGameStarted) {
            // Update physics
            this.updatePhysics();
        }
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize game when the page loads
window.addEventListener('load', () => {
    new FallFight();
}); 