/**
 * mapping-manager.js
 *
 * Manages the mapping between TaskMaster entities/fields and ticketing system entities/fields
 * Provides a configurable way to map TaskMaster concepts to different ticketing systems
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, findProjectRoot } from '../utils.js';
import { getTicketingSystemType, getConfig } from '../config-manager.js';

// Calculate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define default mappings for supported ticketing systems
const DEFAULT_MAPPINGS = {
	// Jira default mappings
	jira: {
		issueTypes: {
			task: 'Story',
			subtask: 'Subtask',
			epic: 'Epic'
		},
		fields: {
			priority: {
				enabled: true,
				mapping: {
					high: 'High',
					medium: 'Medium',
					low: 'Low',
					default: 'Medium'
				}
			},
			status: {
				enabled: true,
				mapping: {
					pending: 'To Do',
					'in-progress': 'In Progress',
					review: 'In Review',
					done: 'Done',
					cancelled: 'Cancelled',
					default: 'To Do'
				}
			},
			assignee: {
				enabled: false
			},
			labels: {
				enabled: true,
				prefix: 'taskmaster-'
			}
		},
		relationships: {
			'depends-on': 'Blocks',
			'related-to': 'Relates to'
		},
		fieldsToIgnore: ['priority']
	},

	// Azure DevOps default mappings
	azure: {
		issueTypes: {
			task: 'User Story',
			subtask: 'Task',
			epic: 'Epic'
		},
		fields: {
			priority: {
				enabled: true,
				mapping: {
					high: '1',
					medium: '2',
					low: '3',
					default: '2'
				}
			},
			status: {
				enabled: true,
				mapping: {
					pending: 'New',
					'in-progress': 'Active',
					review: 'Resolved',
					done: 'Closed',
					cancelled: 'Removed',
					default: 'New'
				}
			},
			assignee: {
				enabled: false
			},
			labels: {
				enabled: true,
				prefix: 'taskmaster-'
			}
		},
		relationships: {
			'depends-on': 'Predecessor',
			'related-to': 'Related'
		},
		fieldsToIgnore: []
	},

	// GitHub default mappings
	github: {
		issueTypes: {
			task: 'issue',
			subtask: 'issue',
			epic: 'issue'
		},
		fields: {
			priority: {
				enabled: true,
				useLabels: true,
				mapping: {
					high: 'priority:high',
					medium: 'priority:medium',
					low: 'priority:low',
					default: 'priority:medium'
				}
			},
			status: {
				enabled: true,
				useLabels: true,
				mapping: {
					pending: 'status:pending',
					'in-progress': 'status:in-progress',
					review: 'status:review',
					done: 'status:done',
					cancelled: 'status:cancelled',
					default: 'status:pending'
				}
			},
			assignee: {
				enabled: false
			},
			labels: {
				enabled: true,
				prefix: 'taskmaster-'
			}
		},
		relationships: {
			'depends-on': 'depends on',
			'related-to': 'related to'
		},
		fieldsToIgnore: []
	}
};

// Cache for loaded mappings
let mappingsCache = {};

/**
 * Get the project root directory
 * @returns {string|null} Path to the project root or null if not found
 */
function getProjectRoot(explicitRoot = null) {
	return explicitRoot || findProjectRoot();
}

/**
 * Get mapping configuration file path for a specific ticketing system
 * @param {string} ticketingSystem - The ticketing system type (jira, azure, github)
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {string|null} Path to the mapping file or null if no root found
 */
function getMappingFilePath(ticketingSystem, explicitRoot = null) {
	// Normalize ticketing system name
	let systemFolder = ticketingSystem;
	
	// Handle Azure DevOps special case (the folder is named 'azdevops' but system type might be 'azure')
	if (systemFolder === 'azure') {
		systemFolder = 'azdevops';
	}

	// First try to find the mapping file in the system-specific folder
	const projectRootDir = getProjectRoot(explicitRoot);
	if (!projectRootDir) return null;

	// Check in the system-specific folder first (new location)
	const systemSpecificPath = path.join(
		__dirname,
		systemFolder,
		`${ticketingSystem}-mapping.json`
	);

	// If it exists in the new location, return that path
	if (fs.existsSync(systemSpecificPath)) {
		return systemSpecificPath;
	}

	// For backward compatibility, also check in the old location
	const legacyPath = path.join(
		projectRootDir,
		'taskmaster',
		'mappings',
		`${ticketingSystem}-mapping.json`
	);

	if (fs.existsSync(legacyPath)) {
		log('info', `Using legacy mapping file from ${legacyPath}`);
		return legacyPath;
	}

	// Finally, check in the centralized mappings directory within the ticketing module
	const centralizedPath = path.join(
		__dirname,
		'mappings',
		`${ticketingSystem}-mapping.json`
	);

	return fs.existsSync(centralizedPath) ? centralizedPath : null;
}

/**
 * Load mapping configuration for the specified ticketing system
 * @param {string|null} ticketingSystem - The ticketing system type (jira, azure, github)
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {object} The mapping configuration
 */
function loadMappingConfig(ticketingSystem = null, explicitRoot = null) {
	// Determine which ticketing system to use
	const systemType = ticketingSystem || getTicketingSystemType(explicitRoot);

	// If no ticketing system is configured, return empty mapping
	if (!systemType || systemType === 'none') {
		return {};
	}

	// Check if mapping is already cached
	const cacheKey = `${systemType}-${explicitRoot || 'default'}`;
	if (mappingsCache[cacheKey]) {
		return mappingsCache[cacheKey];
	}

	// Get default mapping for this system
	const defaultMapping = DEFAULT_MAPPINGS[systemType] || {};

	// Try to load custom mapping file
	const mappingFilePath = getMappingFilePath(systemType, explicitRoot);
	let customMapping = {};

	if (mappingFilePath && fs.existsSync(mappingFilePath)) {
		try {
			const rawData = fs.readFileSync(mappingFilePath, 'utf-8');
			customMapping = JSON.parse(rawData);
			log(
				'info',
				`Loaded custom ${systemType} mapping configuration from ${mappingFilePath}`
			);
		} catch (error) {
			log(
				'error',
				`Failed to parse ${systemType} mapping configuration: ${error.message}`
			);
			log('warn', `Using default ${systemType} mapping configuration`);
		}
	} else {
		log(
			'debug',
			`No custom ${systemType} mapping configuration found, using defaults`
		);
	}

	// Deep merge custom mapping over default mapping
	const mergedMapping = deepMerge(defaultMapping, customMapping);

	// Cache the mapping
	mappingsCache[cacheKey] = mergedMapping;

	return mergedMapping;
}

/**
 * Save custom mapping configuration for a ticketing system
 * @param {string} ticketingSystem - The ticketing system type (jira, azure, github)
 * @param {object} mappingConfig - The mapping configuration object
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {boolean} True if saved successfully, false otherwise
 */
function saveMappingConfig(
	ticketingSystem,
	mappingConfig,
	explicitRoot = null
) {
	if (!ticketingSystem || !mappingConfig) {
		log(
			'error',
			'Cannot save mapping config: missing ticketing system or mapping data'
		);
		return false;
	}

	const mappingDir = getMappingConfigDir(explicitRoot);
	if (!mappingDir) {
		log(
			'error',
			'Cannot save mapping config: unable to determine project root'
		);
		return false;
	}

	// Create mapping directory if it doesn't exist
	if (!fs.existsSync(mappingDir)) {
		try {
			fs.mkdirSync(mappingDir, { recursive: true });
			log('info', `Created mapping configuration directory: ${mappingDir}`);
		} catch (error) {
			log('error', `Failed to create mapping directory: ${error.message}`);
			return false;
		}
	}

	const mappingFilePath = path.join(
		mappingDir,
		`${ticketingSystem}-mapping.json`
	);

	try {
		fs.writeFileSync(
			mappingFilePath,
			JSON.stringify(mappingConfig, null, 2),
			'utf-8'
		);
		log(
			'success',
			`Saved ${ticketingSystem} mapping configuration to ${mappingFilePath}`
		);

		// Update cache
		const cacheKey = `${ticketingSystem}-${explicitRoot || 'default'}`;
		mappingsCache[cacheKey] = mappingConfig;

		return true;
	} catch (error) {
		log(
			'error',
			`Failed to save ${ticketingSystem} mapping configuration: ${error.message}`
		);
		return false;
	}
}

/**
 * Initialize default mapping configurations for all supported ticketing systems
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 */
function initializeDefaultMappings(explicitRoot = null) {
	const mappingDir = getMappingConfigDir(explicitRoot);
	if (!mappingDir) {
		log(
			'error',
			'Cannot initialize mappings: unable to determine project root'
		);
		return;
	}

	// Create mapping directory if it doesn't exist
	if (!fs.existsSync(mappingDir)) {
		try {
			fs.mkdirSync(mappingDir, { recursive: true });
			log('info', `Created mapping configuration directory: ${mappingDir}`);
		} catch (error) {
			log('error', `Failed to create mapping directory: ${error.message}`);
			return;
		}
	}

	// Save default mappings for each ticketing system
	Object.keys(DEFAULT_MAPPINGS).forEach((system) => {
		const mappingFilePath = path.join(mappingDir, `${system}-mapping.json`);

		// Only create if it doesn't exist
		if (!fs.existsSync(mappingFilePath)) {
			try {
				fs.writeFileSync(
					mappingFilePath,
					JSON.stringify(DEFAULT_MAPPINGS[system], null, 2),
					'utf-8'
				);
				log(
					'info',
					`Created default ${system} mapping configuration at ${mappingFilePath}`
				);
			} catch (error) {
				log(
					'error',
					`Failed to create default ${system} mapping: ${error.message}`
				);
			}
		}
	});
}

/**
 * Get the issue type mapping for a task type in the configured ticketing system
 * @param {string} taskType - The TaskMaster task type (task, subtask, epic)
 * @param {string|null} ticketingSystem - Optional ticketing system override
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {string} The mapped issue type in the ticketing system
 */
function getIssueTypeMapping(
	taskType,
	ticketingSystem = null,
	explicitRoot = null
) {
	const mapping = loadMappingConfig(ticketingSystem, explicitRoot);

	if (!mapping.issueTypes) return taskType; // Fallback to same name

	return mapping.issueTypes[taskType] || taskType;
}

/**
 * Get the field mapping for a TaskMaster field in the configured ticketing system
 * @param {string} fieldName - The TaskMaster field name (priority, status, etc.)
 * @param {string} fieldValue - The TaskMaster field value
 * @param {string|null} ticketingSystem - Optional ticketing system override
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {object} The mapped field value or null if field is disabled
 */
function getFieldMapping(
	fieldName,
	fieldValue,
	ticketingSystem = null,
	explicitRoot = null
) {
	const mapping = loadMappingConfig(ticketingSystem, explicitRoot);

	if (!mapping.fields || !mapping.fields[fieldName]) {
		return { enabled: true, value: fieldValue }; // No mapping, use as is
	}

	const fieldConfig = mapping.fields[fieldName];

	// Check if field is enabled
	if (fieldConfig.enabled === false) {
		return { enabled: false, value: null };
	}

	// If no mapping defined, return the original value
	if (!fieldConfig.mapping) {
		return { enabled: true, value: fieldValue };
	}

	// Return the mapped value or default or original
	const mappedValue =
		fieldConfig.mapping[fieldValue] ||
		fieldConfig.mapping.default ||
		fieldValue;

	return {
		enabled: true,
		value: mappedValue,
		useLabels: fieldConfig.useLabels || false // For GitHub-style implementations
	};
}

/**
 * Check if a field should be ignored in the ticketing system
 * @param {string} fieldName - The field name to check
 * @param {string|null} ticketingSystem - Optional ticketing system override
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {boolean} True if the field should be ignored, false otherwise
 */
function shouldIgnoreField(
	fieldName,
	ticketingSystem = null,
	explicitRoot = null
) {
	const mapping = loadMappingConfig(ticketingSystem, explicitRoot);

	if (!mapping.fieldsToIgnore || !Array.isArray(mapping.fieldsToIgnore)) {
		return false;
	}

	return mapping.fieldsToIgnore.includes(fieldName);
}

/**
 * Get the relationship mapping in the configured ticketing system
 * @param {string} relationType - The TaskMaster relationship type (depends-on, related-to)
 * @param {string|null} ticketingSystem - Optional ticketing system override
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {string} The mapped relationship type in the ticketing system
 */
function getRelationshipMapping(
	relationType,
	ticketingSystem = null,
	explicitRoot = null
) {
	const mapping = loadMappingConfig(ticketingSystem, explicitRoot);

	if (!mapping.relationships) return relationType; // Fallback to same name

	return mapping.relationships[relationType] || relationType;
}

/**
 * Helper function to deep merge objects
 * @param {object} target - Target object
 * @param {object} source - Source object to merge into target
 * @returns {object} The merged object
 */
function deepMerge(target, source) {
	if (!source) return target;

	const output = { ...target };

	Object.keys(source).forEach((key) => {
		if (
			source[key] &&
			typeof source[key] === 'object' &&
			!Array.isArray(source[key])
		) {
			output[key] = deepMerge(output[key] || {}, source[key]);
		} else {
			output[key] = source[key];
		}
	});

	return output;
}

/**
 * Reset the mapping cache (mainly for testing)
 */
function resetMappingCache() {
	mappingsCache = {};
}

export {
	loadMappingConfig,
	saveMappingConfig,
	initializeDefaultMappings,
	getIssueTypeMapping,
	getFieldMapping,
	shouldIgnoreField,
	getRelationshipMapping,
	resetMappingCache
};
