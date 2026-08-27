import Phaser from 'phaser';
import { COLOURS, FONTS, GIFT_MESSAGES, TEXT_RESOLUTION, SAFE_MARGIN } from '../ui/constants';
import { createButton, createTextButton, createPanel, createAmbientParticles, createPillTitle } from '../ui/UIButton';
import { getFriends, type Friend } from '../lib/friends';
import {
  sendGift,
  getGiftInbox,
  claimGift,
  createShowcase,
  getFriendLeaderboard,
  type GiftInbox,
} from '../lib/gifts';
import { getSession } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';

type SocialTab = 'inbox' | 'send' | 'leaderboard' | 'showcase';

const GIFT_TYPES = [
  { type: 'treat_bundle', emoji: '', label: 'Treat Bundle' },
  { type: 'toy', emoji: '', label: 'Toy' },
  { type: 'blanket_pattern', emoji: '', label: 'Blanket' },
  { type: 'decoration', emoji: '', label: 'Decoration' },
];

export class SocialScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private tab: SocialTab = 'inbox';
  private container!: Phaser.GameObjects.Container;
  private friends: Friend[] = [];
  private inbox: GiftInbox[] = [];
  private selectedFriend?: Friend;
  private selectedGiftType?: string;
  private selectedMessage?: string;
  private showcaseToken?: string;
  private leaderboard: Array<{
    username: string;
    avatarEmoji: string;
    totalRescued: number;
    level: number;
  }> = [];
  private loading = false;

  constructor() {
    super({ key: 'SocialScene' });
  }

  async create(): Promise<void> {
    this.container = this.add.container(0, 0);
    this.friends = [];
    this.inbox = [];
    this.selectedFriend = undefined;
    this.selectedGiftType = undefined;
    this.selectedMessage = undefined;
    this.showcaseToken = undefined;

    // Load data
    if (isSupabaseConfigured() && getSession()) {
      try {
        const [friends, inbox] = await Promise.all([
          getFriends(),
          getGiftInbox(),
        ]);
        this.friends = friends;
        this.inbox = inbox;
      } catch {
        // Offline or not logged in
      }
    }

    // Viewport resize handling
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      const w = gameSize.width;
      const h = gameSize.height;
      if (Math.abs(w - this._lastWidth) > 50 || Math.abs(h - this._lastHeight) > 50) {
        this._lastWidth = w;
        this._lastHeight = h;
        this.scene.restart();
      }
    });
    this._lastWidth = this.scale.width;
    this._lastHeight = this.scale.height;

    // Fade-in transition
    this.cameras.main.fadeIn(400, 245, 235, 224);

    this.renderView();
  }

  private clearView(): void {
    this.container.removeAll(true);
  }

  private renderView(): void {
    this.clearView();
    const { width, height } = this.scale;

    // Background
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xfef9ef)
    );

    // Subtle envelope/mail outlines background pattern
    const bgPattern = this.add.graphics();
    bgPattern.lineStyle(1, 0xd4c8b8, 0.05);
    for (let ex = 50; ex < width; ex += 110) {
      for (let ey = 40; ey < height; ey += 110) {
        const ox = ((ey / 110) % 2) * 55;
        const x = ex + ox, y = ey;
        bgPattern.strokeRect(x - 12, y - 8, 24, 16);
        bgPattern.lineBetween(x - 12, y - 8, x, y + 2);
        bgPattern.lineBetween(x + 12, y - 8, x, y + 2);
      }
    }
    this.container.add(bgPattern);

    // Title
    this.container.add(
      createPillTitle(this, width / 2, 30, 'Social', {
        bgColour: 0x9b59b6,
        icon: 'icon-social-scene',
        iconSize: 24,
      })
    );

    // Tab bar
    this.renderTabBar(width);

    // Tab content
    switch (this.tab) {
      case 'inbox': this.renderInbox(width, height); break;
      case 'send': this.renderSendGift(width, height); break;
      case 'leaderboard': this.renderLeaderboard(width, height); break;
      case 'showcase': this.renderShowcase(width, height); break;
    }

    // Back button
    this.container.add(
      // 16px clearance + half the 31px button height.
      createTextButton(this, width / 2, height - (SAFE_MARGIN + 16),
        '← Back to centre', () => {
          this.scene.start('GameScene');
        })
    );
  }

  private renderTabBar(width: number): void {
    const tabs: { key: SocialTab; label: string; badge?: number }[] = [
      { key: 'inbox', label: `Inbox${this.inbox.length > 0 ? ` (${this.inbox.length})` : ''}` },
      { key: 'send', label: 'Send' },
      { key: 'leaderboard', label: 'Board' },
      { key: 'showcase', label: 'Share' },
    ];

    const tabWidth = (width - 40) / tabs.length;
    tabs.forEach((t, i) => {
      const x = 20 + i * tabWidth + tabWidth / 2;
      const isActive = this.tab === t.key;

      const bg = this.add.rectangle(x, 65, tabWidth - 4, 30,
        isActive ? 0x4a9c5d : 0xe0d6c8
      ).setInteractive({ useHandCursor: true });

      const text = this.add.text(x, 65, t.label, {
        fontSize: '14px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
        color: isActive ? '#ffffff' : COLOURS.text,
      }).setOrigin(0.5);

      bg.on('pointerdown', () => {
        this.tab = t.key;
        if (t.key === 'leaderboard' && this.leaderboard.length === 0) {
          this.loadLeaderboard();
        } else {
          this.renderView();
        }
      });

      this.container.add(bg);
      this.container.add(text);
    });
  }

  // ── Inbox ──────────────────────────────────────────────────

  private renderInbox(width: number, height: number): void {
    const startY = 100;

    if (this.inbox.length === 0) {
      this.container.add(
        this.add.text(width / 2, height / 2 - 30, 'No gifts yet!', {
          fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
      this.container.add(
        this.add.text(width / 2, height / 2 + 10,
          'Ask your friends to send you something!', {
          fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
      return;
    }

    this.inbox.slice(0, 8).forEach((gift, i) => {
      const y = startY + i * 60;
      const message = GIFT_MESSAGES.find((m) => m.code === gift.messagePresetCode);
      const giftDef = GIFT_TYPES.find((g) => g.type === gift.giftType);

      // Gift card (panel with shadow)
      this.container.add(
        createPanel(this, width / 2, y, width - 40, 50, {
          fillColour: 0xffffff,
          borderColour: 0xc8b8a4,
          borderWidth: 2,
          radius: 10,
        })
      );

      // From
      this.container.add(
        this.add.text(30, y - 12,
          `${gift.fromAvatarEmoji} ${gift.fromUsername}`, {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0, 0.5)
      );

      // Gift type + message
      this.container.add(
        this.add.text(30, y + 8,
          `${giftDef?.emoji ?? '[gift]'} "${message?.text ?? gift.messagePresetCode}"`, {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
        }).setOrigin(0, 0.5)
      );

      // Claim button
      this.container.add(
        createButton(this, width - 60, y, 'Open!', () => {
          this.claimGiftAction(gift.id, i);
        }, { width: 80, fontSize: '14px' })
      );
    });
  }

  private async claimGiftAction(giftId: string, index: number): Promise<void> {
    try {
      await claimGift(giftId);
      this.inbox.splice(index, 1);
      this.renderView();
    } catch {
      // Show error inline
    }
  }

  // ── Send Gift ──────────────────────────────────────────────

  private renderSendGift(width: number, height: number): void {
    const startY = 100;

    if (this.friends.length === 0) {
      this.container.add(
        this.add.text(width / 2, height / 2 - 20, 'Add friends first!', {
          fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
      this.container.add(
        this.add.text(width / 2, height / 2 + 15,
          'Use the Friends screen to add friends by code.', {
          fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
      return;
    }

    // Step 1: Choose friend
    this.container.add(
      this.add.text(width / 2, startY, '1. Choose a friend:', {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    const friendY = startY + 30;
    this.friends.slice(0, 6).forEach((friend, i) => {
      const x = 60 + i * 70;
      const isSelected = this.selectedFriend?.id === friend.id;

      const bg = this.add.circle(x, friendY, 25,
        isSelected ? 0x4a9c5d : 0xe0d6c8
      ).setInteractive({ useHandCursor: true });

      const emoji = this.add.text(x, friendY, friend.avatarEmoji, {
        fontSize: '22px',
      }).setOrigin(0.5);

      const name = this.add.text(x, friendY + 32, friend.username.slice(0, 8), {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);

      bg.on('pointerdown', () => {
        this.selectedFriend = friend;
        this.renderView();
      });

      this.container.add(bg);
      this.container.add(emoji);
      this.container.add(name);
    });

    // Step 2: Choose gift type
    const giftY = friendY + 70;
    this.container.add(
      this.add.text(width / 2, giftY, '2. Choose a gift:', {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    GIFT_TYPES.forEach((gift, i) => {
      const x = width / 2 - 120 + i * 80;
      const y = giftY + 35;
      const isSelected = this.selectedGiftType === gift.type;

      const panel = createPanel(this, x, y, 65, 50, {
        fillColour: isSelected ? 0x4a9c5d : 0xffffff,
        borderColour: 0xc8b8a4,
        borderWidth: 2,
        radius: 8,
      });
      const bg = this.add.rectangle(x, y, 65, 50, 0x000000, 0)
        .setInteractive({ useHandCursor: true });

      const emoji = this.add.text(x, y - 8, gift.emoji, {
        fontSize: '22px',
      }).setOrigin(0.5);

      const label = this.add.text(x, y + 15, gift.label, {
        fontSize: '14px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
        color: isSelected ? '#ffffff' : COLOURS.text,
      }).setOrigin(0.5);

      bg.on('pointerdown', () => {
        this.selectedGiftType = gift.type;
        this.renderView();
      });

      this.container.add(panel);
      this.container.add(bg);
      this.container.add(emoji);
      this.container.add(label);
    });

    // Step 3: Choose message
    const msgY = giftY + 95;
    this.container.add(
      this.add.text(width / 2, msgY, '3. Add a message:', {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    const msgStartY = msgY + 20;
    const msgCols = 2;
    const colW = (width - 60) / msgCols;

    GIFT_MESSAGES.slice(0, 8).forEach((msg, i) => {
      const col = i % msgCols;
      const row = Math.floor(i / msgCols);
      const x = 30 + col * colW + colW / 2;
      const y = msgStartY + row * 30;
      const isSelected = this.selectedMessage === msg.code;

      const text = this.add.text(x, y, `${isSelected ? '> ' : '  '}${msg.text}`, {
        fontSize: '14px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
        color: isSelected ? COLOURS.primary : COLOURS.text,
      }).setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      text.on('pointerdown', () => {
        this.selectedMessage = msg.code;
        this.renderView();
      });

      this.container.add(text);
    });

    // Send button
    const canSend = this.selectedFriend && this.selectedGiftType && this.selectedMessage;
    if (canSend) {
      const sendY = msgStartY + Math.ceil(8 / msgCols) * 30 + 20;
      this.container.add(
        createButton(this, width / 2, sendY,
          `Send to ${this.selectedFriend!.username}!`, async () => {
          if (this.loading) return;
          this.loading = true;
          try {
            await sendGift(
              this.selectedFriend!.id,
              this.selectedGiftType!,
              this.selectedMessage!
            );
            // Reset and show success
            this.selectedFriend = undefined;
            this.selectedGiftType = undefined;
            this.selectedMessage = undefined;
            this.loading = false;
            this.showToast('Gift sent!');
            // Celebration particles
            const particles = createAmbientParticles(this, [], {
              count: 16, minAlpha: 0.3, maxAlpha: 0.7, speed: 2,
            });
            particles.setDepth(90);
            this.time.delayedCall(4000, () => particles.destroy());
            this.renderView();
          } catch (err) {
            this.loading = false;
            this.showToast((err as Error).message ?? 'Failed to send');
          }
        }, { width: 280 })
      );
    }
  }

  // ── Leaderboard ────────────────────────────────────────────

  private async loadLeaderboard(): Promise<void> {
    try {
      this.leaderboard = await getFriendLeaderboard();
    } catch {
      this.leaderboard = [];
    }
    this.renderView();
  }

  private renderLeaderboard(width: number, height: number): void {
    const startY = 100;

    this.container.add(
      this.add.text(width / 2, startY, 'Friends Leaderboard', {
        fontSize: '20px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    if (this.leaderboard.length === 0) {
      this.container.add(
        this.add.text(width / 2, height / 2, 'Add friends to see the leaderboard!', {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
      return;
    }

    const medalColours = [0xffd700, 0xc0c0c0, 0xcd7f32];

    this.leaderboard.slice(0, 10).forEach((entry, i) => {
      const y = startY + 45 + i * 40;

      // Rank
      const rank = i < 3 ? '' : `${i + 1}.`;
      if (i < 3) {
        this.container.add(
          this.add.circle(40, y, 10, medalColours[i])
        );
      } else {
        this.container.add(
          this.add.text(30, y, rank, {
            fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.text,
          }).setOrigin(0, 0.5)
        );
      }

      // Avatar + name
      this.container.add(
        this.add.text(65, y, `${entry.avatarEmoji} ${entry.username}`, {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0, 0.5)
      );

      // Stats
      this.container.add(
        this.add.text(width - 30, y,
          `Lv${entry.level} · ${entry.totalRescued} rescued`, {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
        }).setOrigin(1, 0.5)
      );

      // Divider
      if (i < this.leaderboard.length - 1) {
        this.container.add(
          this.add.rectangle(width / 2, y + 20, width - 60, 1, 0xe0d6c8)
        );
      }
    });
  }

  // ── Showcase ───────────────────────────────────────────────

  private renderShowcase(width: number, height: number): void {
    const startY = 100;

    this.container.add(
      this.add.text(width / 2, startY, 'Share Your Centre', {
        fontSize: '20px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, startY + 30,
        'Create a snapshot link to show off\nyour centre to friends and family!', {
        fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.textLight,
        align: 'center',
      }).setOrigin(0.5)
    );

    if (this.showcaseToken) {
      // Show the link
      const url = `${window.location.origin}/showcase/${this.showcaseToken}`;

      this.container.add(
        this.add.text(width / 2, startY + 90, 'Showcase created!', {
          fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.primary,
        }).setOrigin(0.5)
      );

      this.container.add(
        this.add.text(width / 2, startY + 120, 'Share this code with family:', {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );

      // Token display (for copying)
      this.container.add(
        createPanel(this, width / 2, startY + 155, 300, 40, {
          fillColour: 0xffffff,
          borderColour: 0x4a9c5d,
          borderWidth: 2,
          radius: 10,
        })
      );
      this.container.add(
        this.add.text(width / 2, startY + 155, this.showcaseToken, {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0.5)
      );

      this.container.add(
        this.add.text(width / 2, startY + 190, 'Link expires in 7 days', {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );
    } else {
      this.container.add(
        createButton(this, width / 2, startY + 90,
          'Create Showcase Link', async () => {
          if (this.loading) return;
          this.loading = true;
          try {
            const result = await createShowcase();
            this.showcaseToken = result.token;
            this.loading = false;
            this.renderView();
          } catch {
            this.loading = false;
            this.showToast('Failed to create showcase');
          }
        }, { width: 280 })
      );
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private showToast(message: string): void {
    const { width } = this.scale;
    const toast = this.add.container(width / 2, -40);
    const bg = this.add.rectangle(0, 0, 320, 40, 0x3a2e22, 0.9);
    const text = this.add.text(0, 0, message, {
      fontSize: '15px', fontFamily: FONTS.body, color: '#ffffff',
    }).setOrigin(0.5);
    toast.add([bg, text]);
    toast.setDepth(100);

    this.tweens.add({
      targets: toast,
      y: 50,
      duration: 400,
      ease: 'Back.easeOut',
      hold: 2500,
      yoyo: true,
      onComplete: () => toast.destroy(),
    });
  }
}
