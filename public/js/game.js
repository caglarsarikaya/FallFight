class FallFight {
    constructor() {
        this.socket = null; // Set on join: the online socket or a LocalSocket
        this.onlineSocket = this.connectOnline();
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
        // Physics runs at a fixed 60 Hz step, so these are per-step values
        this.physicsStep = 1 / 60;
        this.physicsAccumulator = 0;
        this.lastFrameTime = null;
        this.playerSpeed = 0.02; // ~4.8 blocks/s top speed
        this.jumpForce = 0.17;   // ~1.2 block high jump
        this.gravity = 0.012;
        this.breakDelay = 400;   // ms before a broken block disappears
        this.lastMoveEmit = 0;
        this.isDead = false;
        this.particles = [];
        this.velocity = new THREE.Vector3();
        this.isOnGround = false;
        this.isGameStarted = false;
        this.REQUIRED_PLAYERS = 1; // In dev mode, only 1 player is required
        
        this.airControl = 0.2;
        this.groundFriction = 0.8;
        this.airFriction = 0.93;
        
        // Character designs as a class property
        this.characterDesigns = {
            cowboy: {
                body: { color: 0x8B4513, height: 1.8 }, // Brown
                hat: { color: 0x8B4513, size: 0.4 }, // Brown cowboy hat
                weapon: {
                    type: 'revolver',
                    color: 0x696969,
                    scale: { x: 0.15, y: 0.3, z: 0.1 }
                }
            },
            legolas: {
                body: { color: 0x90EE90, height: 1.9 }, // Light green
                hair: { color: 0xFFD700, length: 0.4 }, // Golden hair
                weapon: {
                    type: 'bow',
                    color: 0x8B4513,
                    scale: { x: 0.1, y: 0.5, z: 0.05 }
                }
            },
            witcher: {
                body: { color: 0x2F4F4F, height: 1.85 }, // Dark slate gray
                armor: { color: 0x696969, thickness: 0.1 }, // Gray armor
                weapon: {
                    type: 'sword',
                    color: 0xC0C0C0,
                    scale: { x: 0.08, y: 0.6, z: 0.02 }
                }
            },
            mario: {
                body: { color: 0xFF0000, height: 1.6 }, // Red
                overalls: { color: 0x0000FF, width: 0.7 }, // Blue
                hat: { color: 0xFF0000, size: 0.3 } // Red cap
            },
            squirrel: {
                body: { color: 0xDEB887, height: 1.5 }, // Burlywood
                tail: { color: 0xDEB887, length: 0.6 }, // Matching tail
                ears: { color: 0xDEB887, size: 0.2 }
            },
            zeus: {
                body: { color: 0xFFFFFF, height: 2.0 }, // White
                beard: { color: 0xF0F0F0, length: 0.3 }, // White beard
                weapon: {
                    type: 'thunderbolt',
                    color: 0xFFFF00,
                    scale: { x: 0.1, y: 0.7, z: 0.1 }
                }
            }
        };
        
        this.setupEventListeners();
    }

    connectOnline() {
        const button = document.getElementById('play-online-button');
        const serverUrl = window.FALLFIGHT_SERVER_URL;
        // Without a configured server, only a page served by the Node server itself can go online
        if (!serverUrl && location.hostname.endsWith('github.io')) {
            button.textContent = 'Online unavailable';
            return null;
        }

        const socket = io(serverUrl || undefined, { transports: ['websocket', 'polling'] });
        socket.on('connect', () => {
            button.disabled = false;
            button.textContent = 'Play Online';
        });
        socket.on('disconnect', () => {
            button.disabled = true;
            button.textContent = 'Connecting to server...';
        });
        return socket;
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

        // Another player fell out of the arena
        this.socket.on('playerFell', (data) => {
            this.handleOtherPlayerFell(data.playerId);
        });

        // Last player standing
        this.socket.on('gameOver', (data) => {
            const won = data.winnerId === this.socket.id;
            this.showGameOver(
                won ? 'YOU WIN!' : (data.winnerName ? `${data.winnerName} wins!` : 'Nobody survived!'),
                won ? '#4CAF50' : '#ff5252'
            );
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
        const needed = (data.requiredPlayers || this.REQUIRED_PLAYERS) - data.players.length;
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
            
            // Create player list UI
            this.createPlayerListUI();
            
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

            // Update player list
            this.roomPlayers = data.players;
            this.updatePlayerList(data.players);

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
                    otherPlayer.mesh.position.set(x, 1.5, z);
                    otherPlayer.mesh.rotation.y = angle + Math.PI;
                    otherPlayer.targetPosition = otherPlayer.mesh.position.clone();
                    otherPlayer.targetRotationY = otherPlayer.mesh.rotation.y;
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
            
            // Initialize camera for first person view
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            
            const canvas = document.getElementById('game-canvas');
            console.log('Found game canvas:', canvas);
            
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true
            });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            
            // Initialize raycaster for block breaking
            this.raycaster = new THREE.Raycaster();
            this.raycaster.far = 5; // Limit break distance

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
            // Create a striped texture for the blocks
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const context = canvas.getContext('2d');

            // Fill with base color
            context.fillStyle = '#808080';
            context.fillRect(0, 0, 128, 128);

            // Add stripes
            context.fillStyle = '#666666';
            const stripeWidth = 16;
            for (let i = 0; i < 128; i += stripeWidth * 2) {
                context.fillRect(i, 0, stripeWidth, 128);
            }

            // Add border
            context.strokeStyle = '#444444';
            context.lineWidth = 8;
            context.strokeRect(0, 0, 128, 128);

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 1);

            // Create block geometry with slightly smaller size for visible gaps
            const blockGeometry = new THREE.BoxGeometry(0.98, 1, 0.98);
            const blockMaterial = new THREE.MeshPhongMaterial({ 
                map: texture,
                bumpMap: texture,
                bumpScale: 0.05,
                shininess: 10
            });

            // Create blocks for the platform
            for (let x = -15; x < 15; x++) {
                for (let z = -15; z < 15; z++) {
                    const block = new THREE.Mesh(blockGeometry, blockMaterial);
                    block.position.set(x, 0, z);
                    // Rotate every other block 90 degrees for variety
                    if ((x + z) % 2 === 0) {
                        block.rotation.y = Math.PI / 2;
                    }
                    this.scene.add(block);
                    this.blocks.set(`${x},${z}`, block);
                }
            }

            // Create death zone layer (larger than the platform)
            const deathZoneGeometry = new THREE.BoxGeometry(40, 0.5, 40);
            const deathZoneMaterial = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.7,
                emissive: 0xff0000,
                emissiveIntensity: 0.5
            });
            this.deathZone = new THREE.Mesh(deathZoneGeometry, deathZoneMaterial);
            this.deathZone.position.set(0, -2, 0); // Position it 2 units below the platform
            this.scene.add(this.deathZone);

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
        const playOnlineButton = document.getElementById('play-online-button');
        const usernameInput = document.getElementById('username');

        playButton.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            if (username) {
                this.joinGame(username, false);
            }
        });

        playOnlineButton.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            if (username) {
                this.joinGame(username, true);
            }
        });

        // Also allow Enter key to submit
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const username = usernameInput.value.trim();
                if (username) {
                    // Enter goes online when connected, otherwise plays vs bots
                    this.joinGame(username, !!(this.onlineSocket && this.onlineSocket.connected));
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
        if (!this.isGameStarted) return;

        // Update mouse position for raycaster
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        if (this.playerObject && document.pointerLockElement) {
            // Rotate player body (and camera) left/right
            const sensitivity = 0.002;
            this.playerObject.rotation.y -= event.movementX * sensitivity;
            
            // Rotate camera up/down (with limits)
            this.camera.rotation.x -= event.movementY * sensitivity;
            this.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.camera.rotation.x));
        }
    }

    handleClick(event) {
        if (!this.playerObject || !this.raycaster || !this.isGameStarted || this.isDead) return;

        // Update raycaster to use exact center of screen
        const breakingRaycaster = new THREE.Raycaster();
        breakingRaycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        breakingRaycaster.far = 4; // Set maximum breaking distance

        // Get all blocks that can be broken
        const blocks = Array.from(this.blocks.values());
        const intersects = breakingRaycaster.intersectObjects(blocks, false);

        if (intersects.length > 0) {
            const block = intersects[0].object;
            const pos = block.position;
            
            // Calculate swing direction based on intersection point
            const hitPoint = intersects[0].point;
            const swingDirection = new THREE.Vector3()
                .subVectors(hitPoint, this.camera.position)
                .normalize();
            
            // Play axe swing animation towards the block
            this.swingAxe(swingDirection);
            
            // Emit block breaking event
            this.socket.emit('breakBlock', {
                x: pos.x,
                y: pos.y,
                z: pos.z
            });
        } else {
            // Swing axe even if no block is hit
            this.swingAxe();
        }
    }

    joinGame(username, online) {
        if (this.socket) return;
        if (online) {
            this.socket = this.onlineSocket;
        } else {
            if (this.onlineSocket) this.onlineSocket.disconnect();
            this.socket = new LocalSocket();
        }
        this.setupSocketListeners();

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
        if (data.playerId !== this.socket.id) {
            this.swingRemoteAxe(data.playerId);
        }

        const block = this.blocks.get(`${data.x},${data.z}`);
        if (block && !block.userData.breaking) {
            // Tint the block so players can see it is about to go
            block.userData.breaking = true;
            block.material = block.material.clone();
            block.material.color.set(0xff6b6b);

            // The block under your feet is out of view, so flash a warning
            if (this.playerObject && !this.isDead &&
                Math.round(this.playerObject.position.x) === data.x &&
                Math.round(this.playerObject.position.z) === data.z) {
                this.flashDanger();
            }

            // Create breaking animation
            this.createBreakingParticles(block.position);

            // Remove block after delay
            setTimeout(() => {
                this.scene.remove(block);
                this.blocks.delete(`${data.x},${data.z}`);
            }, this.breakDelay);
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
            
            particle.life = 1;
            this.scene.add(particle);
            particles.push(particle);
            this.particles.push(particle);
        }

        return particles;
    }

    createPlayerListUI() {
        const gameUI = document.getElementById('game-ui');
        
        // Create player list container
        const playerList = document.createElement('div');
        playerList.id = 'player-list';
        playerList.style.position = 'fixed';
        playerList.style.top = '20px';
        playerList.style.right = '20px';
        playerList.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        playerList.style.padding = '10px';
        playerList.style.borderRadius = '5px';
        playerList.style.color = 'white';
        playerList.style.fontFamily = 'Arial, sans-serif';
        playerList.style.minWidth = '200px';
        
        // Add title
        const title = document.createElement('div');
        title.textContent = 'Players';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '5px';
        title.style.borderBottom = '1px solid white';
        playerList.appendChild(title);
        
        // Add list container
        const listContainer = document.createElement('div');
        listContainer.id = 'player-list-container';
        playerList.appendChild(listContainer);
        
        gameUI.appendChild(playerList);
    }

    updatePlayerList(players) {
        const listContainer = document.getElementById('player-list-container');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        players.forEach(player => {
            const playerEntry = document.createElement('div');
            playerEntry.style.margin = '3px 0';
            const playerType = player.id === this.socket.id ? 
                this.characterType : 
                (this.players.get(player.id)?.characterType || 'unknown');
            playerEntry.textContent = `${player.username} (${playerType})`;
            if (player.out) {
                playerEntry.style.textDecoration = 'line-through';
                playerEntry.style.opacity = '0.5';
            }
            listContainer.appendChild(playerEntry);
        });
    }

    addPlayer(player) {
        const characterType = this.getRandomCharacterType();
        const design = this.characterDesigns[characterType];
        const model = this.createCharacterModel(characterType, design);

        // Add player name label above the head
        const nameLabel = this.createPlayerLabel(player.username);
        nameLabel.position.y = 1.2;
        model.group.add(nameLabel);

        model.group.position.set(0, 1.5, 0);
        this.scene.add(model.group);
        this.players.set(player.id, {
            mesh: model.group,
            limbs: model.limbs,
            username: player.username,
            characterType: characterType,
            targetPosition: null,
            targetRotationY: 0,
            walkPhase: 0,
            swingTime: 0
        });
    }

    createPlayerLabel(username) {
        // Create canvas for the text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        // Set text properties
        context.font = 'bold 32px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // Add background with border
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add text
        context.fillStyle = 'white';
        context.fillText(username, canvas.width / 2, canvas.height / 2);

        // Create texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true
        });

        // Create sprite
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(1, 0.25, 1);

        return sprite;
    }

    createPlayerCharacter() {
        // The local player is only a physics point with a camera; the body is never seen in first person
        const characterType = this.getRandomCharacterType();
        this.characterType = characterType; // Store character type for player list
        const design = this.characterDesigns[characterType];

        this.playerObject = new THREE.Group();
        this.playerObject.position.set(0, 2, 0);
        this.scene.add(this.playerObject);

        // Set up first person camera (origin rests 1 unit above the block top, eyes ~1.6 above it)
        this.camera.position.set(0, 0.6, 0);
        this.playerObject.add(this.camera);

        // Create weapon for first person view
        this.createWeaponView(characterType, design);
    }

    getRandomCharacterType() {
        const types = ['cowboy', 'legolas', 'witcher', 'mario', 'squirrel', 'zeus'];
        return types[Math.floor(Math.random() * types.length)];
    }

    // Blocky humanoid. The returned group's origin is the physics point, 1 unit above the feet,
    // matching how the local player rests on blocks.
    createCharacterModel(type, design) {
        const group = new THREE.Group();
        const rig = new THREE.Group();
        rig.scale.setScalar(design.body.height / 1.8);
        rig.position.y = -1.0;
        group.add(rig);

        const box = (w, h, d, color, x = 0, y = 0, z = 0, parent = rig) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                new THREE.MeshLambertMaterial({ color })
            );
            mesh.position.set(x, y, z);
            parent.add(mesh);
            return mesh;
        };
        // Limbs hang from a pivot at the shoulder/hip so they can swing
        const limb = (w, h, color, x, y) => {
            const pivot = new THREE.Group();
            pivot.position.set(x, y, 0);
            rig.add(pivot);
            box(w, h, w, color, 0, -h / 2, 0, pivot);
            return pivot;
        };

        const bodyColor = design.body.color;
        const legColor = design.overalls ? design.overalls.color
            : new THREE.Color(bodyColor).multiplyScalar(0.55).getHex();
        const skin = type === 'squirrel' ? bodyColor : 0xf1c27d;

        // Model faces -Z, the same as the camera's forward direction
        const leftLeg = limb(0.25, 0.75, legColor, -0.13, 0.75);
        const rightLeg = limb(0.25, 0.75, legColor, 0.13, 0.75);
        box(0.55, 0.65, 0.3, bodyColor, 0, 1.075, 0);
        const leftArm = limb(0.2, 0.65, bodyColor, -0.38, 1.38);
        const rightArm = limb(0.2, 0.65, bodyColor, 0.38, 1.38);
        box(0.45, 0.45, 0.45, skin, 0, 1.625, 0);
        box(0.08, 0.08, 0.02, 0x222222, -0.1, 1.66, -0.23);
        box(0.08, 0.08, 0.02, 0x222222, 0.1, 1.66, -0.23);

        // Axe in the right hand, blade pointing forward
        const axe = this.createAxe();
        axe.scale.setScalar(0.8);
        axe.position.set(0, -0.6, -0.15);
        axe.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
        rightArm.add(axe);

        switch (type) {
            case 'cowboy': {
                const hat = design.hat.color;
                const brim = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16),
                    new THREE.MeshLambertMaterial({ color: hat }));
                brim.position.y = 1.87;
                rig.add(brim);
                box(0.32, 0.22, 0.32, hat, 0, 1.98, 0);
                break;
            }
            case 'legolas':
                box(0.47, 0.1, 0.47, design.hair.color, 0, 1.88, 0);
                box(0.47, 0.6, 0.1, design.hair.color, 0, 1.55, 0.22);
                break;
            case 'witcher':
                box(0.58, 0.5, 0.06, design.armor.color, 0, 1.1, -0.17);
                box(0.47, 0.1, 0.47, 0xdddddd, 0, 1.88, 0);
                box(0.06, 0.9, 0.03, 0xc0c0c0, 0, 1.15, 0.18).rotation.z = 0.5;
                break;
            case 'mario':
                box(0.57, 0.35, 0.32, design.overalls.color, 0, 0.92, 0);
                box(0.48, 0.12, 0.48, design.hat.color, 0, 1.9, 0);
                box(0.3, 0.04, 0.2, design.hat.color, 0, 1.86, -0.3);
                box(0.25, 0.06, 0.02, 0x3b2314, 0, 1.55, -0.235);
                break;
            case 'squirrel': {
                const tail = box(0.25, 0.8, 0.25, design.tail.color, 0, 1.0, 0.35);
                tail.rotation.x = -0.5;
                box(0.1, 0.2, 0.06, design.ears.color, -0.14, 1.94, 0);
                box(0.1, 0.2, 0.06, design.ears.color, 0.14, 1.94, 0);
                break;
            }
            case 'zeus':
                box(0.45, 0.1, 0.47, design.beard.color, 0, 1.88, 0);
                box(0.4, 0.35, 0.08, design.beard.color, 0, 1.45, -0.25);
                box(0.08, 0.5, 0.08, design.weapon.color, -0.38, 1.0, -0.15).rotation.z = 0.4;
                break;
        }

        return { group, limbs: { leftArm, rightArm, leftLeg, rightLeg } };
    }

    createWeaponView(type, design) {
        // Always create an axe for first person view, regardless of character type
        const axeGroup = this.createAxe();
        
        // Position weapon in view
        axeGroup.position.set(0.5, -0.5, -0.8);
        axeGroup.rotation.set(0.3, -Math.PI / 6, 0.1);
        this.weapon = axeGroup;
        this.axe = axeGroup; // Store axe reference for animations
        this.camera.add(this.weapon);
    }

    createRevolver(design) {
        const gunGroup = new THREE.Group();
        
        // Barrel
        const barrelGeometry = new THREE.BoxGeometry(design.scale.x, design.scale.y, design.scale.z);
        const barrelMaterial = new THREE.MeshPhongMaterial({ color: design.color });
        const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        
        // Handle
        const handleGeometry = new THREE.BoxGeometry(design.scale.x, design.scale.y * 0.4, design.scale.z);
        const handle = new THREE.Mesh(handleGeometry, barrelMaterial);
        handle.position.y = -design.scale.y * 0.3;
        handle.rotation.z = Math.PI / 6;
        
        gunGroup.add(barrel);
        gunGroup.add(handle);
        return gunGroup;
    }

    createBow(design) {
        const bowGroup = new THREE.Group();
        
        // Bow curve
        const curve = new THREE.EllipseCurve(
            0, 0,
            design.scale.y, design.scale.y * 0.3,
            0, Math.PI * 2,
            false,
            0
        );
        
        const points = curve.getPoints(50);
        const bowGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const bowMaterial = new THREE.LineBasicMaterial({ color: design.color });
        const bowCurve = new THREE.Line(bowGeometry, bowMaterial);
        
        // String
        const stringGeometry = new THREE.BoxGeometry(design.scale.x * 0.1, design.scale.y * 2, design.scale.z * 0.1);
        const stringMaterial = new THREE.MeshPhongMaterial({ color: 0xFFFFFF });
        const string = new THREE.Mesh(stringGeometry, stringMaterial);
        
        bowGroup.add(bowCurve);
        bowGroup.add(string);
        return bowGroup;
    }

    createSword(design) {
        const swordGroup = new THREE.Group();
        
        // Blade
        const bladeGeometry = new THREE.BoxGeometry(design.scale.x, design.scale.y, design.scale.z);
        const bladeMaterial = new THREE.MeshPhongMaterial({ color: design.color });
        const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
        
        // Handle
        const handleGeometry = new THREE.BoxGeometry(design.scale.x * 1.5, design.scale.y * 0.2, design.scale.z * 1.5);
        const handleMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.position.y = -design.scale.y * 0.5;
        
        swordGroup.add(blade);
        swordGroup.add(handle);
        return swordGroup;
    }

    createThunderbolt(design) {
        const boltGroup = new THREE.Group();
        
        // Create zigzag shape for thunderbolt
        const points = [
            new THREE.Vector3(0, design.scale.y/2, 0),
            new THREE.Vector3(design.scale.x, design.scale.y/4, 0),
            new THREE.Vector3(-design.scale.x, 0, 0),
            new THREE.Vector3(design.scale.x, -design.scale.y/4, 0),
            new THREE.Vector3(0, -design.scale.y/2, 0)
        ];
        
        const boltGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const boltMaterial = new THREE.LineBasicMaterial({ color: design.color });
        const bolt = new THREE.Line(boltGeometry, boltMaterial);
        
        boltGroup.add(bolt);
        return boltGroup;
    }

    createAxe() {
        const axeGroup = new THREE.Group();
        
        // Axe handle
        const handleGeometry = new THREE.BoxGeometry(0.08, 0.5, 0.08);
        const handleMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        
        // Axe head
        const headGeometry = new THREE.BoxGeometry(0.25, 0.25, 0.05);
        const headMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 0.3;
        
        axeGroup.add(handle);
        axeGroup.add(head);
        return axeGroup;
    }

    updatePlayerPosition(data) {
        const player = this.players.get(data.playerId);
        if (player && player.mesh) {
            // animateRemotePlayers eases the mesh toward these targets
            player.targetPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
            // A serialized THREE.Euler arrives as {_x, _y, _z}
            const rotY = data.rotation._y !== undefined ? data.rotation._y : data.rotation.y;
            if (typeof rotY === 'number') player.targetRotationY = rotY;
        }
    }

    animateRemotePlayers(dt) {
        const ease = 1 - Math.exp(-dt * 15);
        this.players.forEach(player => {
            const mesh = player.mesh;
            if (!mesh || !player.targetPosition) return;

            const before = mesh.position.clone();
            mesh.position.lerp(player.targetPosition, ease);

            // Turn the shortest way round
            let turn = player.targetRotationY - mesh.rotation.y;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            mesh.rotation.y += turn * ease;

            // Walk cycle driven by horizontal speed
            const speed = Math.hypot(mesh.position.x - before.x, mesh.position.z - before.z) / Math.max(dt, 0.001);
            const stride = Math.min(speed / 4, 1) * 0.8;
            player.walkPhase += dt * speed * 2.5;
            const swing = Math.sin(player.walkPhase) * stride;
            const { leftArm, rightArm, leftLeg, rightLeg } = player.limbs;
            leftLeg.rotation.x = swing;
            rightLeg.rotation.x = -swing;
            leftArm.rotation.x = -swing * 0.8;
            rightArm.rotation.x = swing * 0.8;

            // Axe chop overrides the right arm
            if (player.swingTime > 0) {
                player.swingTime = Math.max(0, player.swingTime - dt);
                const progress = 1 - player.swingTime / 0.3;
                rightArm.rotation.x = Math.PI * 0.9 * Math.sin(progress * Math.PI);
            }
        });
    }

    flashDanger() {
        let flash = document.getElementById('danger-flash');
        if (!flash) {
            flash = document.createElement('div');
            flash.id = 'danger-flash';
            flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;' +
                'box-shadow:inset 0 0 120px 40px rgba(255,0,0,0.75);opacity:0;transition:opacity 0.4s;';
            document.body.appendChild(flash);
        }
        flash.style.transition = 'none';
        flash.style.opacity = '1';
        void flash.offsetWidth; // apply the full opacity before fading out
        flash.style.transition = 'opacity 0.6s';
        flash.style.opacity = '0';
    }

    swingRemoteAxe(playerId) {
        const player = this.players.get(playerId);
        if (player) player.swingTime = 0.3;
    }

    handleOtherPlayerFell(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            // Let the fall play out before removing the body
            setTimeout(() => {
                this.scene.remove(player.mesh);
                this.players.delete(playerId);
            }, 800);
        }
        if (this.roomPlayers) {
            const entry = this.roomPlayers.find(p => p.id === playerId);
            if (entry) entry.out = true;
            this.updatePlayerList(this.roomPlayers);
        }
    }

    updateParticles(dt) {
        this.particles = this.particles.filter(particle => {
            particle.velocity.y -= 0.6 * dt;
            particle.position.addScaledVector(particle.velocity, dt * 60);
            particle.life -= dt;
            if (particle.life <= 0) {
                this.scene.remove(particle);
                return false;
            }
            return true;
        });
    }

    showGameOver(text, color) {
        if (document.getElementById('game-over')) return;
        if (document.pointerLockElement) document.exitPointerLock();

        const deathMessage = document.getElementById('death-message');
        if (deathMessage) deathMessage.remove();

        const overlay = document.createElement('div');
        overlay.id = 'game-over';
        overlay.className = 'screen';
        overlay.style.background = 'rgba(0, 0, 0, 0.6)';

        const title = document.createElement('h1');
        title.className = 'title';
        title.style.color = color;
        title.textContent = text;

        const button = document.createElement('button');
        button.textContent = 'Play again';
        button.addEventListener('click', () => location.reload());

        overlay.appendChild(title);
        overlay.appendChild(button);
        document.body.appendChild(overlay);
    }

    updatePhysics() {
        if (!this.playerObject || this.isDead) return;

        // Apply gravity
        this.velocity.y -= this.gravity;

        // Check if player is on ground
        this.isOnGround = false;
        const groundRaycaster = new THREE.Raycaster(
            this.playerObject.position.clone(),
            new THREE.Vector3(0, -1, 0)
        );
        
        const groundIntersects = groundRaycaster.intersectObjects(Array.from(this.blocks.values()));
        
        if (groundIntersects.length > 0 && groundIntersects[0].distance < 1.0) {
            this.isOnGround = true;
            this.velocity.y = Math.max(0, this.velocity.y);
            this.playerObject.position.y = groundIntersects[0].point.y + 1.0;
        }

        // Handle movement with air control
        const currentSpeed = this.isOnGround ? this.playerSpeed : this.playerSpeed * this.airControl;

        if (this.controls.forward) {
            this.velocity.x -= Math.sin(this.playerObject.rotation.y) * currentSpeed;
            this.velocity.z -= Math.cos(this.playerObject.rotation.y) * currentSpeed;
        }
        if (this.controls.backward) {
            this.velocity.x += Math.sin(this.playerObject.rotation.y) * currentSpeed;
            this.velocity.z += Math.cos(this.playerObject.rotation.y) * currentSpeed;
        }
        if (this.controls.left) {
            this.velocity.x -= Math.cos(this.playerObject.rotation.y) * currentSpeed;
            this.velocity.z += Math.sin(this.playerObject.rotation.y) * currentSpeed;
        }
        if (this.controls.right) {
            this.velocity.x += Math.cos(this.playerObject.rotation.y) * currentSpeed;
            this.velocity.z -= Math.sin(this.playerObject.rotation.y) * currentSpeed;
        }

        // Only allow jumping when on ground
        if (this.controls.jump && this.isOnGround) {
            this.velocity.y = this.jumpForce;
            this.isOnGround = false; // Prevent double jumps
        }

        // Apply velocity
        this.playerObject.position.add(this.velocity);

        // Apply appropriate friction
        const friction = this.isOnGround ? this.groundFriction : this.airFriction;
        this.velocity.x *= friction;
        this.velocity.z *= friction;

        // Check for death zone collision
        if (this.playerObject.position.y <= this.deathZone.position.y + 0.25) {
            this.handlePlayerFall();
            return;
        }

        // Emit position updates ~20 times a second
        const now = performance.now();
        if (now - this.lastMoveEmit >= 50) {
            this.lastMoveEmit = now;
            this.socket.emit('playerMove', {
                position: this.playerObject.position,
                rotation: this.playerObject.rotation
            });
        }
    }

    handlePlayerFall() {
        if (this.isDead) return;
        this.isDead = true;
        console.log('Player eliminated!');
        
        // Show elimination message
        const gameUI = document.getElementById('game-ui');
        const eliminationMessage = document.createElement('div');
        eliminationMessage.style.position = 'fixed';
        eliminationMessage.style.top = '50%';
        eliminationMessage.style.left = '50%';
        eliminationMessage.style.transform = 'translate(-50%, -50%)';
        eliminationMessage.style.color = 'red';
        eliminationMessage.style.fontSize = '48px';
        eliminationMessage.style.textShadow = '2px 2px 4px black';
        eliminationMessage.id = 'death-message';
        eliminationMessage.textContent = 'YOU DIED!';
        gameUI.appendChild(eliminationMessage);

        // Emit player elimination
        this.socket.emit('playerEliminated');

        if (this.socket instanceof LocalSocket) {
            // Offline: the bots fight on and gameOver shows the winner
            setTimeout(() => this.showGameOver('YOU DIED!', '#ff5252'), 1500);
        } else {
            // Return to menu after a delay
            setTimeout(() => {
                location.reload();
            }, 2000);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const now = performance.now();
        const dt = this.lastFrameTime === null ? 0 : Math.min((now - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = now;

        if (this.isGameStarted) {
            // Fixed 60 Hz physics so speed doesn't depend on the monitor's refresh rate
            this.physicsAccumulator += dt;
            let steps = 0;
            while (this.physicsAccumulator >= this.physicsStep && steps < 5) {
                this.updatePhysics();
                this.physicsAccumulator -= this.physicsStep;
                steps++;
            }
            if (steps === 5) this.physicsAccumulator = 0;

            this.animateRemotePlayers(dt);
            this.updateParticles(dt);
        }

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }

    swingAxe(hitDirection = null) {
        if (!this.axe || this.isSwinging) return;
        this.isSwinging = true;

        const startRotation = this.axe.rotation.clone();
        const swingDuration = 200; // milliseconds
        const startTime = Date.now();

        // If we have a hit direction, align the swing with it
        if (hitDirection) {
            const targetRotation = new THREE.Euler().setFromVector3(hitDirection);
            this.axe.rotation.x = targetRotation.x;
            this.axe.rotation.y = targetRotation.y;
        }

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / swingDuration, 1);

            // Swing animation with easing
            const swingAngle = Math.sin(progress * Math.PI) * Math.PI / 2;
            this.axe.rotation.x = startRotation.x - swingAngle;

            // Add some side rotation for more natural swing
            this.axe.rotation.z = startRotation.z + (Math.sin(progress * Math.PI) * Math.PI / 8);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Reset position with smooth transition
                this.axe.rotation.copy(startRotation);
                this.isSwinging = false;
            }
        };

        animate();
    }
}

// Initialize game when the page loads
window.addEventListener('load', () => {
    new FallFight();
}); 