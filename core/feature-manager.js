// core/feature-manager.js
// Enhanced feature management system with lifecycle and state management

class FeatureManager {
  constructor() {
    this.features = new Map();
    this.activeFeature = null;
    this.previousFeature = null;
    this.featureStack = [];
    this.container = null;
    this.mainApp = null;
  }

  /**
   * Initialize the feature manager
   * @param {HTMLElement} mainApp - Main app container
   * @param {HTMLElement} featureContainer - Feature container
   */
  init(mainApp, featureContainer) {
    this.mainApp = mainApp;
    this.container = featureContainer;

    if (!this.container) {
      console.error("Feature container not found!");
      return false;
    }

    console.log("✅ Feature Manager initialized");
    return true;
  }

  /**
   * Register a new feature
   * @param {string} name - Feature identifier
   * @param {Object} config - Feature configuration
   */
  register(name, config) {
    if (this.features.has(name)) {
      console.warn(`Feature "${name}" already registered`);
      return;
    }

    this.features.set(name, {
      name,
      config: {
        title: config.title || name,
        description: config.description || "",
        version: config.version || "1.0.0",
        path: config.path || `./features/${name}`,
        ...config,
      },
      instance: null,
      module: null,
      loaded: false,
      active: false,
    });

    console.log(`✅ Feature registered: ${name}`);
    console.log("THis is the path:", config.path);
  }

  /**
   * Load feature HTML template
   * @param {string} name - Feature name
   * @returns {Promise<string>} HTML content
   */
  async loadHTML(name) {
    const feature = this.features.get(name);
    if (!feature) throw new Error(`Feature "${name}" not found`);

    try {
      // Build absolute path for production compatibility
      const basePath = window.location.pathname.substring(
        0,
        window.location.pathname.lastIndexOf("/")
      );
      const htmlPath = `${basePath}/${feature.config.path}/index.html`.replace(
        /\/\//g,
        "/"
      );
      const response = await fetch(htmlPath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      console.error(`Failed to load HTML for ${name}:`, error);
      throw error;
    }
  }
  /**
   * Load feature CSS
   * @param {string} name - Feature name
   */
  async loadCSS(name) {
    const feature = this.features.get(name);
    if (!feature) return;

    try {
      // Check if CSS already loaded
      const existingLink = document.getElementById(`feature-css-${name}`);

      if (existingLink) return;

      const link = document.createElement("link");
      link.id = `feature-css-${name}`;
      link.rel = "stylesheet";
      // âœ… Construct absolute path from current location
      const basePath = window.location.pathname.substring(
        0,
        window.location.pathname.lastIndexOf("/")
      );
      link.href = `${basePath}/${feature.config.path}/styles.css`.replace(
        /\/\//g,
        "/"
      );
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔍 CSS LOADING DIAGNOSTIC:");
      console.log("   Feature name:", name);
      console.log("   Feature config path:", feature.config.path);
      console.log("   Constructed href:", link.href);
      console.log("   Current window.location:", window.location.href);
      console.log("   Document base URI:", document.baseURI);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      return new Promise((resolve, reject) => {
        link.onload = () => {
          console.log(`✅ CSS loaded for: ${name}`);
          resolve();
        };
        link.onerror = () => {
          console.warn(`⚠️ No CSS file for: ${name}`);
          resolve(); // Don't fail if CSS doesn't exist
        };
        document.head.appendChild(link);
      });
    } catch (error) {
      console.warn(`Failed to load CSS for ${name}:`, error);
    }
  }

  /**
   * Unload feature CSS
   * @param {string} name - Feature name
   */
  unloadCSS(name) {
    const link = document.getElementById(`feature-css-${name}`);
    if (link) {
      link.remove();
      console.log(`🗑️ CSS unloaded for: ${name}`);
    }
  }

  /**
   * Load and execute feature module
   * @param {string} name - Feature name
   * @returns {Promise<Object>} Feature module
   */
  async loadModule(name) {
    const feature = this.features.get(name);
    if (!feature) throw new Error(`Feature "${name}" not found`);

    try {
      // Build absolute path for production compatibility
      const basePath = window.location.pathname.substring(
        0,
        window.location.pathname.lastIndexOf("/")
      );
      const timestamp = new Date().getTime();
      const modulePath =
        `${basePath}/${feature.config.path}/feature.js?t=${timestamp}`.replace(
          /\/\//g,
          "/"
        );
      const module = await import(modulePath);
      return module.default || module;
    } catch (error) {
      console.error(`Failed to load module for ${name}:`, error);
      throw error;
    }
  }

  /**
   * Activate and display a feature
   * @param {string} name - Feature to activate
   * @param {Object} params - Parameters to pass to feature
   * @param {boolean} addToStack - Whether to add to navigation stack
   */
  async activate(name, params = {}, addToStack = true) {
    console.log(`🔵 Attempting to activate feature: "${name}"`);

    if (!this.features.has(name)) {
      console.error(`❌ Feature "${name}" not registered`);
      return false;
    }

    const feature = this.features.get(name);
    console.log(`📋 Feature config:`, feature.config);

    try {
      // Save current feature to stack if requested
      if (addToStack && this.activeFeature) {
        this.featureStack.push({
          name: this.activeFeature,
          params: this.features.get(this.activeFeature).lastParams,
        });
      }

      // Deactivate current feature if any
      if (this.activeFeature) {
        console.log(`⏸️  Deactivating current feature: ${this.activeFeature}`);
        await this.deactivate(this.activeFeature);
      }

      // Hide main app, show feature container
      console.log(`👁️  Hiding main app, showing feature container`);
      if (this.mainApp) this.mainApp.style.display = "none";
      this.container.style.display = "block";

      // Load CSS first
      console.log(`🎨 Loading CSS for: ${name}`);
      await this.loadCSS(name);

      // Load HTML template
      console.log(`📄 Loading HTML for: ${name}`);
      const html = await this.loadHTML(name);
      this.container.innerHTML = html;
      console.log(`✅ HTML loaded and inserted`);

      // Load and initialize module if not already loaded
      if (!feature.loaded) {
        console.log(`📦 Loading module for: ${name}`);
        feature.module = await this.loadModule(name);
        feature.loaded = true;
        console.log(`✅ Module loaded:`, feature.module);
      } else {
        console.log(`♻️  Module already loaded, reusing`);
      }

      // Initialize feature with params
      if (feature.module && typeof feature.module.init === "function") {
        console.log(`🚀 Initializing feature with params:`, params);
        feature.instance = await feature.module.init(this.container, params);
        console.log(`✅ Feature initialized`);
      } else {
        console.warn(`⚠️  No init function found in module`);
      }

      feature.active = true;
      feature.lastParams = params;
      this.previousFeature = this.activeFeature;
      this.activeFeature = name;

      console.log(`✅ Feature activated successfully: ${name}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to activate feature "${name}":`, error);
      console.error(`   Error stack:`, error.stack);
      this.container.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #ff5c5c; font-family: Arial;">
        <h2>⚠️ Failed to load feature</h2>
        <h3>${name}</h3>
        <p style="color: #666; margin: 20px 0;">${error.message}</p>
        <pre style="text-align: left; background: #f5f5f5; padding: 10px; border-radius: 4px; max-width: 600px; margin: 20px auto; overflow: auto;">${error.stack}</pre>
        <button onclick="window.featureManager.goBack()" 
                style="padding: 10px 20px; background: #0b5fff; color: white; border: none; border-radius: 8px; cursor: pointer;">
          ← Go Back
        </button>
      </div>
    `;
      return false;
    }
  }

  /**
   * Deactivate current feature
   * @param {string} name - Feature to deactivate
   */
  async deactivate(name) {
    if (!this.features.has(name)) return;

    const feature = this.features.get(name);

    try {
      // Call cleanup if available
      if (feature.module && typeof feature.module.cleanup === "function") {
        await feature.module.cleanup(feature.instance);
      }

      feature.active = false;
      feature.instance = null;

      // Unload CSS
      this.unloadCSS(name);

      console.log(`⚠️ Feature deactivated: ${name}`);
    } catch (error) {
      console.error(`Error deactivating feature "${name}":`, error);
    }
  }

  /**
   * Go back to previous feature or main app
   */
  async goBack() {
    if (this.featureStack.length > 0) {
      const previous = this.featureStack.pop();
      await this.activate(previous.name, previous.params, false);
    } else {
      await this.deactivateAll();
    }
  }

  /**
   * Deactivate all features and return to main app
   */
  async deactivateAll() {
    if (this.activeFeature) {
      await this.deactivate(this.activeFeature);
    }

    // Clear navigation stack
    this.featureStack = [];
    this.activeFeature = null;
    this.previousFeature = null;

    // Show main app, hide feature container
    if (this.mainApp) this.mainApp.style.display = "block";
    this.container.style.display = "none";
    this.container.innerHTML = "";

    console.log("🏠 Returned to main app");
  }

  /**
   * Reload a feature (useful for hot reload)
   * @param {string} name - Feature to reload
   */
  async reload(name) {
    if (!this.features.has(name)) return;

    const feature = this.features.get(name);
    const wasActive = feature.active;
    const params = feature.lastParams;

    // Reset feature state
    feature.loaded = false;
    feature.module = null;
    feature.instance = null;

    // Reload CSS
    this.unloadCSS(name);

    if (wasActive) {
      await this.activate(name, params, false);
    }

    console.log(`🔄 Feature reloaded: ${name}`);
  }

  /**
   * Get list of registered features
   * @returns {Array} Feature list with metadata
   */
  list() {
    return Array.from(this.features.entries()).map(([name, feature]) => ({
      name,
      ...feature.config,
      active: feature.active,
      loaded: feature.loaded,
    }));
  }

  /**
   * Get active feature name
   * @returns {string|null}
   */
  getActive() {
    return this.activeFeature;
  }

  /**
   * Check if a feature is active
   * @param {string} name - Feature name
   * @returns {boolean}
   */
  isActive(name) {
    return this.activeFeature === name;
  }
}

// Create singleton instance
const featureManager = new FeatureManager();

// Make it globally accessible for debugging and button clicks
if (typeof window !== "undefined") {
  window.featureManager = featureManager;
}

export default featureManager;
