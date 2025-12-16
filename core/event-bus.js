// core/event-bus.js
// Enhanced event system for feature-to-feature communication with debugging

class EventBus {
  constructor() {
    this.events = new Map();
    this.debug = false; // Set to true for debugging
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   * @param {string} subscriber - Optional subscriber name for debugging
   * @returns {Function} Unsubscribe function
   */
  on(event, callback, subscriber = "anonymous") {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const handler = {
      callback,
      subscriber,
      id: Math.random().toString(36).substr(2, 9),
    };

    this.events.get(event).push(handler);

    if (this.debug) {
      console.log(`📡 Event subscribed: "${event}" by ${subscriber}`);
    }

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to event (fires once then unsubscribes)
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   * @param {string} subscriber - Optional subscriber name
   */
  once(event, callback, subscriber = "anonymous") {
    const unsubscribe = this.on(
      event,
      (...args) => {
        unsubscribe();
        callback(...args);
      },
      subscriber
    );
    return unsubscribe;
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} callback - Event handler to remove
   */
  off(event, callback) {
    if (!this.events.has(event)) return;

    const handlers = this.events.get(event);
    const filtered = handlers.filter((h) => h.callback !== callback);

    if (filtered.length === 0) {
      this.events.delete(event);
    } else {
      this.events.set(event, filtered);
    }

    if (this.debug) {
      console.log(`📡 Event unsubscribed: "${event}"`);
    }
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {...any} args - Arguments to pass to handlers
   */
  emit(event, ...args) {
    if (!this.events.has(event)) {
      if (this.debug) {
        console.log(`📡 Event emitted (no subscribers): "${event}"`);
      }
      return;
    }

    const handlers = this.events.get(event);

    if (this.debug) {
      console.log(
        `📡 Event emitted: "${event}" to ${handlers.length} subscriber(s)`,
        args
      );
    }

    handlers.forEach((handler) => {
      try {
        handler.callback(...args);
      } catch (error) {
        console.error(
          `Error in event handler for "${event}" (${handler.subscriber}):`,
          error
        );
      }
    });
  }

  /**
   * Clear all subscribers for an event
   * @param {string} event - Event name (if omitted, clears all)
   */
  clear(event) {
    if (event) {
      this.events.delete(event);
      if (this.debug) {
        console.log(`📡 Event cleared: "${event}"`);
      }
    } else {
      this.events.clear();
      if (this.debug) {
        console.log(`📡 All events cleared`);
      }
    }
  }

  /**
   * Get list of active events
   * @returns {Array} List of event names
   */
  listEvents() {
    return Array.from(this.events.keys());
  }

  /**
   * Get subscriber count for an event
   * @param {string} event - Event name
   * @returns {number} Number of subscribers
   */
  subscriberCount(event) {
    return this.events.has(event) ? this.events.get(event).length : 0;
  }

  /**
   * Enable/disable debug mode
   * @param {boolean} enabled - Debug mode state
   */
  setDebug(enabled) {
    this.debug = enabled;
    console.log(`📡 EventBus debug mode: ${enabled ? "ON" : "OFF"}`);
  }
}

// Create singleton
const eventBus = new EventBus();

// Make it globally accessible
if (typeof window !== "undefined") {
  window.eventBus = eventBus;
}

export default eventBus;
