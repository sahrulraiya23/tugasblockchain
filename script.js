// Simple blockchain implementation
class Block {
    constructor(index, timestamp, data, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.data = data;
        this.previousHash = previousHash;
        this.hash = this.calculateHash();
    }

    calculateHash() {
        // Simple hash function for demo purposes
        const dataString = this.index + this.timestamp + JSON.stringify(this.data) + this.previousHash;
        return hashString(dataString);
    }
}

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 2;
    }

    createGenesisBlock() {
        return new Block(0, Date.now(), {
            tasks: []
        }, "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    addBlock(newBlock) {
        newBlock.previousHash = this.getLatestBlock().hash;
        newBlock.hash = newBlock.calculateHash();
        this.chain.push(newBlock);
    }

    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (currentBlock.hash !== currentBlock.calculateHash()) {
                return false;
            }

            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }
        }
        return true;
    }

    getTasks() {
        // Process all blocks to determine current state of tasks
        const tasksMap = new Map(); // Use Map to track latest state of each task

        for (const block of this.chain) {
            // Add new tasks
            if (block.data.tasks && Array.isArray(block.data.tasks)) {
                for (const task of block.data.tasks) {
                    tasksMap.set(task.id, {
                        ...task,
                        blockHash: block.hash
                    });
                }
            }

            // Process actions (complete/delete)
            if (block.data.action === 'complete' && block.data.taskId) {
                const task = tasksMap.get(block.data.taskId);
                if (task) {
                    tasksMap.set(block.data.taskId, {
                        ...task,
                        completed: true
                    });
                }
            } else if (block.data.action === 'delete' && block.data.taskId) {
                tasksMap.delete(block.data.taskId);
            }
        }

        // Convert Map values to array
        return Array.from(tasksMap.values());
    }
}

// Simple hash function for demo purposes
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}

// Generate a random blockchain ID
function generateBlockchainId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize blockchain
    const taskChain = new Blockchain();
    const blockchainId = generateBlockchainId();

    // Display blockchain info
    document.getElementById('blockchain-id').textContent = blockchainId;
    document.getElementById('last-block').textContent = taskChain.getLatestBlock().hash.substring(0, 10) + '...';

    // P2P connection variables
    let peer;
    const connections = new Map();
    let myPeerId = null;
    let isInitiator = false; // Track if this peer initiated the connection

    // Initialize P2P connection
    initializePeerConnection();

    // Set up event listeners
    document.getElementById('connect-btn').addEventListener('click', () => {
        const peerId = document.getElementById('connect-peer-id').value.trim();
        if (peerId) {
            connectToPeer(peerId);
        } else {
            showNotification('Masukkan ID peer terlebih dahulu', 'warning');
        }
    });

    document.getElementById('disconnect-all-btn').addEventListener('click', disconnectFromAllPeers);

    document.getElementById('copy-id-btn').addEventListener('click', () => {
        const idText = document.getElementById('my-peer-id').textContent;
        navigator.clipboard.writeText(idText).then(() => {
            showNotification('ID disalin ke clipboard');
        }).catch(err => {
            console.error('Gagal menyalin: ', err);
            showNotification('Gagal menyalin ID', 'error');
        });
    });

    document.getElementById('filter-priority').addEventListener('change', renderTasks);

    document.getElementById('add-task-form').addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form values
        const title = document.getElementById('task-title').value;
        const description = document.getElementById('task-desc').value;
        const deadline = document.getElementById('task-deadline').value;
        const priority = document.getElementById('task-priority').value;
        const subject = document.getElementById('task-subject').value;
        
        // Create task object
        const task = {
            id: Date.now().toString(),
            title,
            description,
            deadline,
            priority,
            subject,
            completed: false,
            createdAt: new Date().toISOString()
        };
        
        // Add task to blockchain
        const newBlock = new Block(taskChain.chain.length, Date.now(), {
            tasks: [task]
        });
        
        taskChain.addBlock(newBlock);
        
        // Update UI
        document.getElementById('last-block').textContent = taskChain.getLatestBlock().hash.substring(0, 10) + '...';
        renderTasks();
        updateStats();
        
        // Broadcast to peers
        broadcastBlockchain();
        
        // Show notification
        showNotification('Tugas berhasil ditambahkan!');
        
        // Reset form
        this.reset();
    });

    function initializePeerConnection() {
        // Create a random peer ID if not already set
        const randomId = 'student-' + Math.floor(Math.random() * 1000000);

        // Initialize the Peer object
        peer = new Peer(randomId, {
            debug: 2
        });

        // When peer is open (connection to PeerServer established)
        peer.on('open', function(id) {
            myPeerId = id;
            document.getElementById('my-peer-id').textContent = id;
            document.getElementById('p2p-status').textContent = 'Online';
            document.getElementById('p2p-status-indicator').className = 'status-indicator status-online';
            updateStats();
            showNotification('Terhubung ke jaringan P2P!');
        });

        // Handle incoming connections
        peer.on('connection', function(conn) {
            handleConnection(conn);
        });

        // Handle errors
        peer.on('error', function(err) {
            console.error('Peer connection error:', err);
            document.getElementById('p2p-status').textContent = 'Error: ' + err.type;
            document.getElementById('p2p-status-indicator').className = 'status-indicator status-offline';
            showNotification('Error koneksi P2P: ' + err.type, 'error');
        });

        // Handle disconnection
        peer.on('disconnected', function() {
            document.getElementById('p2p-status').textContent = 'Terputus';
            document.getElementById('p2p-status-indicator').className = 'status-indicator status-offline';
            showNotification('Terputus dari jaringan P2P', 'warning');

            // Try to reconnect
            setTimeout(() => {
                if (peer.disconnected) {
                    peer.reconnect();
                }
            }, 3000);
        });

        // Handle close
        peer.on('close', function() {
            document.getElementById('p2p-status').textContent = 'Koneksi ditutup';
            document.getElementById('p2p-status-indicator').className = 'status-indicator status-offline';
            connections.clear();
            updatePeersList();
            updateStats();
        });
    }

    // Handle connection to another peer
    function handleConnection(conn) {
        // Add connection to our map
        connections.set(conn.peer, conn);
        updatePeersList();
        updateStats();

        // Handle data received from peers
        conn.on('data', function(data) {
            if (data.type === 'blockchain') {
                // Process received blockchain
                processReceivedBlockchain(data.chain);
            } else if (data.type === 'request_chain') {
                // Send our blockchain to the requesting peer
                conn.send({
                    type: 'blockchain',
                    chain: taskChain.chain
                });
            }
        });

        // Handle connection close
        conn.on('close', function() {
            connections.delete(conn.peer);
            updatePeersList();
            updateStats();
            showNotification(`Peer ${conn.peer.substring(0, 8)}... terputus`, 'warning');
        });

        // Request blockchain from the new peer
        conn.send({
            type: 'request_chain'
        });

        showNotification(`Peer baru terhubung: ${conn.peer.substring(0, 8)}...`);
    }

    // Process received blockchain
    function processReceivedBlockchain(receivedChain) {
        // Convert plain objects back to Block instances
        const reconstructedChain = [];
        for (const blockData of receivedChain) {
            const block = new Block(
                blockData.index,
                blockData.timestamp,
                blockData.data,
                blockData.previousHash
            );
            block.hash = blockData.hash; // Preserve original hash
            reconstructedChain.push(block);
        }

        // Validate the received chain
        const tempChain = new Blockchain();
        tempChain.chain = reconstructedChain;

        if (tempChain.isChainValid()) {
            // Check if received chain is longer than current chain
            if (reconstructedChain.length > taskChain.chain.length) {
                taskChain.chain = reconstructedChain;
                document.getElementById('last-block').textContent = taskChain.getLatestBlock().hash.substring(0, 10) + '...';
                updateStats();
                renderTasks();
                showNotification('Blockchain diperbarui dari jaringan', 'sync');
            }
        } else {
            console.warn('Received invalid blockchain');
        }
    }

    // Connect to another peer
    function connectToPeer(peerId) {
        if (peerId === myPeerId) {
            showNotification('Tidak dapat terhubung ke diri sendiri', 'error');
            return;
        }

        if (connections.has(peerId)) {
            showNotification('Sudah terhubung ke peer ini', 'warning');
            return;
        }

        // Connect to the peer
        const conn = peer.connect(peerId);
        isInitiator = true;

        // Handle successful connection
        conn.on('open', function() {
            handleConnection(conn);
            document.getElementById('connect-peer-id').value = '';
        });

        // Handle errors
        conn.on('error', function(err) {
            console.error('Connection error:', err);
            showNotification('Error koneksi: ' + err, 'error');
        });
    }

    // Broadcast blockchain to all connected peers
    function broadcastBlockchain() {
        connections.forEach(function(conn) {
            conn.send({
                type: 'blockchain',
                chain: taskChain.chain
            });
        });
    }

    // Disconnect from all peers
    function disconnectFromAllPeers() {
        connections.forEach(function(conn) {
            conn.close();
        });
        connections.clear();
        updatePeersList();
        updateStats();
        showNotification('Terputus dari semua peer', 'warning');
    }

    // Update the peers list in the UI
    function updatePeersList() {
        const peersList = document.getElementById('peers-list');
        peersList.innerHTML = '';

        if (connections.size === 0) {
            peersList.innerHTML = '<div class="peer-item">Tidak ada peer terhubung</div>';
            document.getElementById('connected-peers-count').textContent = '0';
            return;
        }

        document.getElementById('connected-peers-count').textContent = connections.size;

        connections.forEach(function(conn, peerId) {
            const peerItem = document.createElement('div');
            peerItem.className = 'peer-item';

            const peerIdSpan = document.createElement('span');
            peerIdSpan.className = 'peer-id';
            peerIdSpan.textContent = peerId;

            const disconnectBtn = document.createElement('button');
            disconnectBtn.className = 'action-btn delete-btn';
            disconnectBtn.textContent = 'Putuskan';
            disconnectBtn.addEventListener('click', function() {
                conn.close();
                connections.delete(peerId);
                updatePeersList();
                updateStats();
                showNotification(`Terputus dari peer ${peerId.substring(0, 8)}...`, 'warning');
            });

            peerItem.appendChild(peerIdSpan);
            peerItem.appendChild(disconnectBtn);
            peersList.appendChild(peerItem);
        });
    }

    // Show notification
    function showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        notification.textContent = message;

        // Set color based on type
        if (type === 'error') {
            notification.style.backgroundColor = '#e74c3c';
        } else if (type === 'warning') {
            notification.style.backgroundColor = '#f39c12';
        } else if (type === 'sync') {
            notification.style.backgroundColor = '#3498db';
        } else {
            notification.style.backgroundColor = '#2ecc71';
        }

        notification.classList.add('show');

        // Hide after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    // Update statistics
    function updateStats() {
        const tasks = taskChain.getTasks();
        document.getElementById('total-blocks').textContent = taskChain.chain.length;
        document.getElementById('total-tasks').textContent = tasks.length;
        document.getElementById('completed-tasks').textContent = tasks.filter(task => task.completed).length;
        document.getElementById('peers-count').textContent = connections.size;
    }

    // Render tasks
   function renderTasks() {
    const taskContainer = document.getElementById('task-container');
    taskContainer.innerHTML = '';

    const filter = document.getElementById('filter-priority').value;
    const tasks = taskChain.getTasks();

    const filteredTasks = filter === 'all' ?
        tasks :
        tasks.filter(task => task.priority === filter);

    if (filteredTasks.length === 0) {
        taskContainer.innerHTML = '<div class="task-item"><p>Tidak ada tugas ditemukan.</p></div>';
        return;
    }

    filteredTasks.forEach(task => {
        const taskEl = document.createElement('div');
        taskEl.className = 'task-item';

        if (task.completed) {
            taskEl.style.backgroundColor = '#f9f9f9';
            taskEl.style.textDecoration = 'line-through';
        }

        const priorityClass = `priority-${task.priority}`;

        taskEl.innerHTML = `
            <div class="task-info">
                <div class="task-title">${task.title}</div>
                <div class="task-details">${task.description || 'Tidak ada deskripsi'}</div>
                <div class="task-details">Mata Kuliah: ${task.subject || '-'}</div>
                <div class="task-date">Deadline: ${new Date(task.deadline).toLocaleDateString()}</div>
                <div class="hash-display">Block Hash: ${task.blockHash ? task.blockHash.substring(0, 15) + '...' : 'N/A'}</div>
            </div>
            <div>
                <span class="task-priority ${priorityClass}">
                    ${task.priority === 'high' ? 'Tinggi' : task.priority === 'medium' ? 'Sedang' : 'Rendah'}
                </span>
            </div>
        `

        taskContainer.appendChild(taskEl);
    });
   }})
