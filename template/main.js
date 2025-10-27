const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  physics: { default: 'arcade' },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};
const game = new Phaser.Game(config);
let player, cursors, speed = GAME_CONFIG.speed;

function preload() {
  this.load.image('bg', GAME_CONFIG.bg);
  this.load.image('player', GAME_CONFIG.sprite);
}

function create() {
  this.add.image(GAME_CONFIG.width/2, GAME_CONFIG.height/2, 'bg').setDisplaySize(GAME_CONFIG.width, GAME_CONFIG.height);
  player = this.physics.add.image(100, GAME_CONFIG.height/2, 'player');
  player.setCollideWorldBounds(true);
  cursors = this.input.keyboard.createCursorKeys();
}

function update() {
  player.setVelocity(0);
  if (cursors.left.isDown) player.setVelocityX(-speed);
  if (cursors.right.isDown) player.setVelocityX(speed);
  if (cursors.up.isDown) player.setVelocityY(-speed);
  if (cursors.down.isDown) player.setVelocityY(speed);
}
