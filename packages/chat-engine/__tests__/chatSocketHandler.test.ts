/**
 * Chat Socket Handler — Tests
 *
 * Unit tests for the Socket.io chat handler exported from @nugen/chat-engine.
 * Verifies: module exports, socket event types, emit helper safety.
 */

import { CONVERSATION_STATUSES, MESSAGE_TYPES, CANNED_RESPONSE_CATEGORIES } from '../src/types';

import type { ServerToClientEvents, ClientToServerEvents, ChatSocketConfig } from '../src';

import {
  emitNewMessage,
  emitMessageRead,
  emitConversationResolved,
  getSocketServer,
} from '../src/socket/chatSocketHandler';

// ═══════════════════════════════════════════════════════════════════════════════

describe('Chat Socket Handler', () => {
  // ─── Exports ───────────────────────────────────────────────────────────────

  describe('Module Exports', () => {
    it('exports initChatSocket function', () => {
      const mod = require('../src/socket/chatSocketHandler');
      expect(typeof mod.initChatSocket).toBe('function');
    });

    it('exports emitNewMessage function', () => {
      expect(typeof emitNewMessage).toBe('function');
    });

    it('exports emitMessageRead function', () => {
      expect(typeof emitMessageRead).toBe('function');
    });

    it('exports emitConversationResolved function', () => {
      expect(typeof emitConversationResolved).toBe('function');
    });

    it('exports getSocketServer function', () => {
      expect(typeof getSocketServer).toBe('function');
    });
  });

  // ─── Socket Server State ───────────────────────────────────────────────────

  describe('Socket Server State', () => {
    it('getSocketServer returns null before initialization', () => {
      expect(getSocketServer()).toBeNull();
    });

    it('emitNewMessage does not throw when server is not initialized', () => {
      expect(() => {
        emitNewMessage('conv-123', {
          conversationId: 'conv-123' as never,
          senderId: 'user-1' as never,
          senderType: 'client',
          type: 'text',
          content: 'Hello',
          isRead: false,
          createdAt: new Date(),
        } as never);
      }).not.toThrow();
    });

    it('emitMessageRead does not throw when server is not initialized', () => {
      expect(() => {
        emitMessageRead('conv-123', 'msg-456', new Date());
      }).not.toThrow();
    });

    it('emitConversationResolved does not throw when server is not initialized', () => {
      expect(() => {
        emitConversationResolved('conv-123');
      }).not.toThrow();
    });
  });

  // ─── Event Types ───────────────────────────────────────────────────────────

  describe('Socket Event Type Definitions', () => {
    it('ServerToClientEvents has required event signatures', () => {
      // Compile-time type checks — these verify the interface shape
      const serverEvents: Record<keyof ServerToClientEvents, true> = {
        new_message: true,
        message_read: true,
        typing_indicator: true,
        conversation_resolved: true,
        staff_presence: true,
      };
      expect(Object.keys(serverEvents)).toHaveLength(5);
    });

    it('ClientToServerEvents has required event signatures', () => {
      const clientEvents: Record<keyof ClientToServerEvents, true> = {
        typing_indicator: true,
        join_conversation: true,
        leave_conversation: true,
      };
      expect(Object.keys(clientEvents)).toHaveLength(3);
    });
  });

  // ─── ChatSocketConfig ──────────────────────────────────────────────────────

  describe('ChatSocketConfig Interface', () => {
    it('requires corsOrigins and verifyToken', () => {
      const config: ChatSocketConfig = {
        corsOrigins: ['http://localhost:3000'],
        verifyToken: async (_token: string) => ({ userId: '1', userType: 'client' }),
      };
      expect(config.corsOrigins).toEqual(['http://localhost:3000']);
      expect(typeof config.verifyToken).toBe('function');
    });

    it('corsOrigins accepts string or array', () => {
      const configStr: ChatSocketConfig = {
        corsOrigins: '*',
        verifyToken: async () => ({ userId: '1', userType: 'client' }),
      };
      const configArr: ChatSocketConfig = {
        corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
        verifyToken: async () => ({ userId: '1', userType: 'client' }),
      };
      expect(typeof configStr.corsOrigins).toBe('string');
      expect(Array.isArray(configArr.corsOrigins)).toBe(true);
    });
  });

  // ─── Integration with Chat Engine Constants ────────────────────────────────

  describe('Chat Engine Constants (used by socket handler)', () => {
    it('CONVERSATION_STATUSES includes active, resolved, archived', () => {
      expect(CONVERSATION_STATUSES).toContain('active');
      expect(CONVERSATION_STATUSES).toContain('resolved');
      expect(CONVERSATION_STATUSES).toContain('archived');
      expect(CONVERSATION_STATUSES).toHaveLength(3);
    });

    it('MESSAGE_TYPES includes text, file, canned_response, system_event', () => {
      expect(MESSAGE_TYPES).toEqual(
        expect.arrayContaining(['text', 'file', 'canned_response', 'system_event']),
      );
      expect(MESSAGE_TYPES).toHaveLength(4);
    });

    it('CANNED_RESPONSE_CATEGORIES has 6 categories', () => {
      expect(CANNED_RESPONSE_CATEGORIES).toHaveLength(6);
      expect(CANNED_RESPONSE_CATEGORIES).toContain('general');
      expect(CANNED_RESPONSE_CATEGORIES).toContain('tax_info');
    });
  });
});
