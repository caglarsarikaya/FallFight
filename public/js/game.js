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
        this.playerSpeed = 0.05;
        this.jumpForce = 0.25;
        this.gravity = 0.01;
        this.velocity = new THREE.Vector3();
        this.isOnGround = false;
        this.isGameStarted = false;
        this.REQUIRED_PLAYERS = 1; // In dev mode, only 1 player is required
        
        this.airControl = 0.2;
        this.groundFriction = 0.8;
        this.airFriction = 0.93;
        
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
        if (!this.playerObject || !this.raycaster || !this.isGameStarted) return;

        // Create a raycaster from camera center (where crosshair is)
        const breakingRaycaster = new THREE.Raycaster();
        breakingRaycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

        // Check for intersections with blocks within axe reach
        const intersects = breakingRaycaster.intersectObjects(
            Array.from(this.blocks.values())
        );

        if (intersects.length > 0 && intersects[0].distance <= 4) { // Axe reach of 4 units
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

            // Visual feedback for block targeting
            console.log('Breaking block at:', pos);
        } else {
            // Swing axe even if no block is hit
            this.swingAxe();
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
            
            // Check for players above this block
            const blockPosition = block.position;
            const checkHeight = 2.0; // Maximum height to check for players
            
            // Check local player
            if (this.playerObject) {
                const playerPos = this.playerObject.position;
                if (Math.abs(playerPos.x - blockPosition.x) < 0.5 &&
                    Math.abs(playerPos.z - blockPosition.z) < 0.5 &&
                    playerPos.y <= blockPosition.y + checkHeight) {
                    // Force player to fall by removing ground detection temporarily
                    this.isOnGround = false;
                    this.velocity.y = -0.1; // Small downward push
                }
            }
            
            // Check other players
            this.players.forEach((player, id) => {
                if (player.mesh) {
                    const otherPos = player.mesh.position;
                    if (Math.abs(otherPos.x - blockPosition.x) < 0.5 &&
                        Math.abs(otherPos.z - blockPosition.z) < 0.5 &&
                        otherPos.y <= blockPosition.y + checkHeight) {
                        // Apply falling to other players
                        player.mesh.position.y -= 0.1; // Small downward push
                        // Notify server about the forced fall
                        this.socket.emit('playerForceFall', { playerId: id });
                    }
                }
            });
            
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
        // Character designs
        const characterDesigns = {
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

        // Create player mesh with character design
        const characterType = this.getRandomCharacterType();
        const design = characterDesigns[characterType];
        
        // Create main body
        const bodyGeometry = new THREE.BoxGeometry(0.6, design.body.height, 0.6);
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: design.body.color,
            visible: false // Invisible in first person
        });
        this.playerObject = new THREE.Mesh(bodyGeometry, bodyMaterial);
        
        // Add character-specific features
        this.addCharacterFeatures(this.playerObject, characterType, design);
        
        // Position player above the blocks
        this.playerObject.position.set(0, 2, 0);
        this.scene.add(this.playerObject);

        // Set up first person camera
        this.camera.position.set(0, design.body.height - 0.2, 0); // Eye level based on height
        this.playerObject.add(this.camera);

        // Create weapon for first person view
        this.createWeaponView(characterType, design);
    }

    getRandomCharacterType() {
        const types = ['cowboy', 'legolas', 'witcher', 'mario', 'squirrel', 'zeus'];
        return types[Math.floor(Math.random() * types.length)];
    }

    addCharacterFeatures(playerObject, type, design) {
        switch(type) {
            case 'cowboy':
                // Add hat
                const hatGeometry = new THREE.ConeGeometry(design.hat.size, design.hat.size, 32);
                const hatMaterial = new THREE.MeshPhongMaterial({ color: design.hat.color });
                const hat = new THREE.Mesh(hatGeometry, hatMaterial);
                hat.position.y = design.body.height/2 + design.hat.size/2;
                playerObject.add(hat);
                break;

            case 'legolas':
                // Add hair
                const hairGeometry = new THREE.BoxGeometry(0.6, design.hair.length, 0.2);
                const hairMaterial = new THREE.MeshPhongMaterial({ color: design.hair.color });
                const hair = new THREE.Mesh(hairGeometry, hairMaterial);
                hair.position.y = design.body.height/2;
                hair.position.z = -0.2;
                playerObject.add(hair);
                break;

            case 'witcher':
                // Add armor plates
                const armorGeometry = new THREE.BoxGeometry(0.7, design.body.height * 0.6, design.armor.thickness);
                const armorMaterial = new THREE.MeshPhongMaterial({ color: design.armor.color });
                const armor = new THREE.Mesh(armorGeometry, armorMaterial);
                armor.position.z = 0.3;
                playerObject.add(armor);
                break;

            case 'mario':
                // Add overalls
                const overallsGeometry = new THREE.BoxGeometry(design.overalls.width, design.body.height * 0.6, 0.65);
                const overallsMaterial = new THREE.MeshPhongMaterial({ color: design.overalls.color });
                const overalls = new THREE.Mesh(overallsGeometry, overallsMaterial);
                playerObject.add(overalls);
                
                // Add hat
                const marioHatGeometry = new THREE.BoxGeometry(design.hat.size * 1.2, design.hat.size * 0.4, design.hat.size);
                const marioHatMaterial = new THREE.MeshPhongMaterial({ color: design.hat.color });
                const marioHat = new THREE.Mesh(marioHatGeometry, marioHatMaterial);
                marioHat.position.y = design.body.height/2 + design.hat.size/2;
                playerObject.add(marioHat);
                break;

            case 'squirrel':
                // Add tail
                const tailGeometry = new THREE.CylinderGeometry(0.1, 0.2, design.tail.length, 8);
                const tailMaterial = new THREE.MeshPhongMaterial({ color: design.tail.color });
                const tail = new THREE.Mesh(tailGeometry, tailMaterial);
                tail.position.z = -0.4;
                tail.rotation.x = Math.PI / 4;
                playerObject.add(tail);
                
                // Add ears
                const earGeometry = new THREE.ConeGeometry(design.ears.size, design.ears.size * 2, 32);
                const earMaterial = new THREE.MeshPhongMaterial({ color: design.ears.color });
                const leftEar = new THREE.Mesh(earGeometry, earMaterial);
                const rightEar = new THREE.Mesh(earGeometry, earMaterial);
                leftEar.position.set(-0.2, design.body.height/2 + design.ears.size, 0);
                rightEar.position.set(0.2, design.body.height/2 + design.ears.size, 0);
                playerObject.add(leftEar);
                playerObject.add(rightEar);
                break;

            case 'zeus':
                // Add beard
                const beardGeometry = new THREE.BoxGeometry(0.4, design.beard.length, 0.3);
                const beardMaterial = new THREE.MeshPhongMaterial({ color: design.beard.color });
                const beard = new THREE.Mesh(beardGeometry, beardMaterial);
                beard.position.y = design.body.height/2 - design.beard.length;
                beard.position.z = 0.2;
                playerObject.add(beard);
                break;
        }
    }

    createWeaponView(type, design) {
        if (!design.weapon) return;

        const weaponGroup = new THREE.Group();
        let weapon;

        switch(design.weapon.type) {
            case 'revolver':
                weapon = this.createRevolver(design.weapon);
                break;
            case 'bow':
                weapon = this.createBow(design.weapon);
                break;
            case 'sword':
                weapon = this.createSword(design.weapon);
                break;
            case 'thunderbolt':
                weapon = this.createThunderbolt(design.weapon);
                break;
            default:
                // Default axe for other characters
                weapon = this.createAxe();
        }

        weaponGroup.add(weapon);
        
        // Position weapon in view
        weaponGroup.position.set(0.5, -0.5, -0.8);
        weaponGroup.rotation.set(0.3, -Math.PI / 6, 0.1);
        this.weapon = weaponGroup;
        
        // Add weapon to camera
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

    addPlayer(player) {
        const characterType = this.getRandomCharacterType();
        const design = this.characterDesigns[characterType];
        
        // Create main body
        const geometry = new THREE.BoxGeometry(0.6, design.body.height, 0.6);
        const material = new THREE.MeshPhongMaterial({ color: design.body.color });
        const playerMesh = new THREE.Mesh(geometry, material);
        
        // Add character features
        this.addCharacterFeatures(playerMesh, characterType, design);
        
        playerMesh.position.set(0, 2, 0);
        this.scene.add(playerMesh);
        this.players.set(player.id, {
            mesh: playerMesh,
            username: player.username,
            characterType: characterType
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

        // Emit position update
        this.socket.emit('playerMove', {
            position: this.playerObject.position,
            rotation: this.playerObject.rotation
        });
    }

    handlePlayerFall() {
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
        eliminationMessage.textContent = 'YOU DIED!';
        gameUI.appendChild(eliminationMessage);

        // Emit player elimination
        this.socket.emit('playerEliminated');

        // Return to menu after a delay
        setTimeout(() => {
            location.reload();
        }, 2000);
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

    swingAxe(hitDirection = null) {
        if (this.isSwinging) return;
        this.isSwinging = true;

        const startRotation = this.axe.rotation.clone();
        const swingDuration = 200; // milliseconds
        const startTime = Date.now();

        // If we have a hit direction, align the axe swing with it
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
                // Reset axe position with smooth transition
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