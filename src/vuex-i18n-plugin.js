/* vuex-i18n defines the Vuexi18nPlugin to enable localization using a vuex
** module to store the translation information. Make sure to also include the
** file vuex-i18n-store.js to include a respective vuex module.
*/

import module from './vuex-i18n-store';
import plurals from './vuex-i18n-plurals';


// renderFn will initialize a function to render the variable substitutions in
// the translation string. identifiers specify the tags will be used to find
// variable substitutions, i.e. {test} or {{test}}, note that we are using a
// closure to avoid recompilation of the regular expression to match tags on
// every render cycle.
let renderFn = function(identifiers, warnings = true) {

	if (identifiers == null || identifiers.length != 2) {
		console.warn('i18n: You must specify the start and end character identifying variable substitutions');
	}

	// construct a regular expression ot find variable substitutions, i.e. {test}
	let matcher = new RegExp('' + identifiers[0] + '{1}(\\w{1}|\\w.+?)' + identifiers[1] + '{1}', 'g');

	// define the replacement function
	let replace = function replace(translation, replacements) {

		// check if the object has a replace property
		if (!translation.replace) {
			return translation;
		}

		return translation.replace(matcher, function(placeholder) {

			// remove the identifiers (can be set on the module level)
			let key = placeholder.replace(identifiers[0], '').replace(identifiers[1], '');

			if (replacements[key] !== undefined) {
				return replacements[key];
			}

			// warn user that the placeholder has not been found
			if (warnings) {
				console.group ? console.group('i18n: Not all placeholders found') : console.warn('i18n: Not all placeholders found');
				console.warn('Text:', translation);
				console.warn('Placeholder:', placeholder);
				if(console.groupEnd) {
					console.groupEnd();
				}
			}

			// return the original placeholder
			return placeholder;
		});
	};

	// the render function will replace variable substitutions and prepare the
	// translations for rendering
	let render = function render(locale, translation, replacements = {}, pluralization = null) {
		// get the type of the property
		let objType = typeof translation;
		let pluralizationType = typeof pluralization;

		let resolvePlaceholders = function() {

			if (isArray(translation)) {

				// replace the placeholder elements in all sub-items
				return translation.map((item) => {
					return replace(item, replacements, false);
				});

			} else if (objType === 'string') {
				return replace(translation, replacements, true);
			}

		};

			// return translation item directly
		if (pluralization === null) {
			return resolvePlaceholders();
		}

		// check if pluralization value is countable
		if (pluralizationType !== 'number') {
			if (warnings) console.warn('i18n: pluralization is not a number');
			return resolvePlaceholders();
		}

		// --- handle pluralizations ---

		// replace all placeholders
		let resolvedTranslation = resolvePlaceholders();

		// initialize pluralizations
		let pluralizations = null;

		// if translations are already an array and have more than one entry,
		// we will not perform a split operation on :::
		if (isArray(resolvedTranslation) && resolvedTranslation.length > 0) {
			pluralizations = resolvedTranslation;

		} else {
			// split translation strings by ::: to find create the pluralization array
			pluralizations = resolvedTranslation.split(':::');
		}

		// determine the pluralization version to use by locale
		let index = plurals.getTranslationIndex(locale, pluralization);

		// check if the specified index is present in the pluralization
		if(typeof pluralizations[index] === 'undefined') {
			if (warnings) {
				console.warn('i18n: pluralization not provided in locale', translation, locale, index);
			}

			// return the first element of the pluralization by default
			return pluralizations[0].trim();
		}

		// return the requested item from the pluralizations
		return pluralizations[index].trim();

	};

	// return the render function to the caller
	return render;

};

// check if the given object is an array
function isArray(obj) {
	return !!obj && Array === obj.constructor;
}

export function createI18n(config) {
	return new VuexI18nPlugin(config);
}

export class VuexI18nPlugin {
	constructor (config = {}) {
		// TODO: remove this block for next major update (API break)
		if (typeof arguments[2] === 'string' || typeof arguments[3] === 'string') {
			console.warn('i18n: Registering the plugin vuex-i18n with a string for `moduleName` or `identifiers` is deprecated. Use a configuration object instead.', 'https://github.com/dkfbasel/vuex-i18n#setup');
			config = {
				moduleName: arguments[2],
				identifiers: arguments[3]
			};
		}

		// merge default options with user supplied options
		config = Object.assign({
			warnings: true,
			moduleName: 'i18n',
			identifiers: ['{', '}'],
			preserveState: false,
			translateFilterName: 'translate',
			translateInFilterName: 'translateIn',
			onTranslationNotFound: function() {}
		}, config);

		this._config = config;

		// initialize the onTranslationNotFound function and make sure it is actually
		// a function
		let onTranslationNotFound = config.onTranslationNotFound;
		if (typeof onTranslationNotFound !== 'function') {
			console.error('i18n: i18n config option onTranslationNotFound must be a function');
			onTranslationNotFound = function() {};
		}

		this.onTranslationNotFound = onTranslationNotFound;
		this._store = Object.create(null);
	};

	// get localized string from store. note that we pass the arguments passed
	// to the function directly to the translateInLanguage function
	translate() {
		// get the current language from the store
		let locale = this._store.state[this._config.moduleName].locale;

		return this.translateInLanguage(locale, ...arguments);
	};

	// get localized string from store in a given language if available.
	// there are two possible signatures for the function.
	// we will check the arguments to make up the options passed.
	// 1: locale, key, options, pluralization
	// 2: locale, key, defaultValue, options, pluralization
	translateInLanguage(locale) {
		// initialize the replacement function
		let render = renderFn(this._config.identifiers, this._config.warnings);

		// read the function arguments
		let args = arguments;

		// initialize options
		let key = '';
		let defaultValue = '';
		let options = {};
		let pluralization = null;

		let count = args.length;

		// check if a default value was specified and fill options accordingly
		if (count >= 3 && typeof args[2] === 'string') {

			key = args[1];
			defaultValue = args[2];

			if (count > 3) {
				options = args[3];
			}

			if (count > 4) {
				pluralization = args[4];
			}

		} else {

			key = args[1];

			// default value was not specified and is therefore the same as the key
			defaultValue = key;

			if (count > 2) {
				options = args[2];
			}

			if (count > 3) {
				pluralization = args[3];
			}

		}

		// return the default value if the locale is not set (could happen on initialization)
		if (!locale) {
			if (this._config.warnings) console.warn('i18n: i18n locale is not set when trying to access translations:', key);
			return defaultValue;
		}

		// get the translations from the store
		let translations = this._store.state[this._config.moduleName].translations;

		// get the last resort fallback from the store
		let fallback = this._store.state[this._config.moduleName].fallback;

		// split locale by - to support partial fallback for regional locales
		// like de-CH, en-UK
		let localeRegional = locale.split('-');

		// flag for translation to exist or not
		let translationExists = true;

		// check if the language exists in the store. return the key if not
		if (translations.hasOwnProperty(locale) === false ) {
			translationExists = false;

			// check if the key exists in the store. return the key if not
		} else if (translations[locale].hasOwnProperty(key) === false) {
			translationExists = false;
		}

		// return the value from the store
		if (translationExists === true) {
			return render(locale, translations[locale][key], options, pluralization);
		}

		// check if a regional locale translation would be available for the key
		// i.e. de for de-CH
		if (localeRegional.length > 1 &&
			translations.hasOwnProperty(localeRegional[0]) === true &&
			translations[localeRegional[0]].hasOwnProperty(key) === true) {
			return render(localeRegional[0], translations[localeRegional[0]][key], options, pluralization);
		}

		// invoke a method if a translation is not found
		let asyncTranslation = this.onTranslationNotFound(locale, key, defaultValue);

		// resolve async translations by updating the store
		if (asyncTranslation) {
			Promise.resolve(asyncTranslation).then((value) => {
				let additionalTranslations = {};
				additionalTranslations[key] = value;
				this.addLocale(locale, additionalTranslations);
			});
		}

		// check if a vaild fallback exists in the store.
		// return the default value if not
		if (translations.hasOwnProperty(fallback) === false ) {
			return render(locale, defaultValue, options, pluralization);
		}

		// check if the key exists in the fallback locale in the store.
		// return the default value if not
		if (translations[fallback].hasOwnProperty(key) === false) {
			return render(fallback, defaultValue, options, pluralization);
		}

		return render(locale, translations[fallback][key], options, pluralization);
	};

	// check if the given key exists in the current locale
	checkKeyExists(key, scope = 'fallback') {

		// get the current language from the store
		let locale = this._store.state[this._config.moduleName].locale;
		let fallback = this._store.state[this._config.moduleName].fallback;
		let translations = this._store.state[this._config.moduleName].translations;

		// check the current translation
		if (translations.hasOwnProperty(locale) && translations[locale].hasOwnProperty(key)) {
			return true;
		}

		if (scope == 'strict') {
			return false;
		}

		// check any localized translations
		let localeRegional = locale.split('-');

		if (localeRegional.length > 1 &&
			translations.hasOwnProperty(localeRegional[0]) &&
			translations[localeRegional[0]].hasOwnProperty(key)) {
			return true;
		}

		if (scope == 'locale') {
			return false;
		}

		// check if a fallback locale exists
		if (translations.hasOwnProperty(fallback) && translations[fallback].hasOwnProperty(key)) {
			return true;
		}

		// key does not exist in the store
		return false;
	};

	// add a filter function to translate in a given locale (i.e. {{ 'something' | translateIn('en') }})
	translateInLanguageFilter(key, locale, ...args) {
		return this.translateInLanguage(locale, key, ...args);
	};

	// set fallback locale
	setFallbackLocale(locale) {
		this._store.dispatch({
			type: `${this._config.moduleName}/setFallbackLocale`,
			locale: locale
		});
	};

	// set the current locale
	setLocale(locale) {
		this._store.dispatch({
			type: `${this._config.moduleName}/setLocale`,
			locale: locale
		});
	};

	// get the current locale
	getLocale() {
		return this._store.state[this._config.moduleName].locale;
	};

	// get all available locales
	getLocales() {
		return Object.keys(store.state[this._config.moduleName].translations);
	};

	// add predefined translations to the store (keeping existing information)
	addLocale(locale, translations) {
		console.log(this._store, this._config.moduleName);

		console.log('addLocale', locale, translations);

		return this._store.dispatch({
			type: `${this._config.moduleName}/addLocale`,
			locale: locale,
			translations: translations
		});
	};

	// replace all locale information in the store
	replaceLocale(locale, translations) {
		return this._store.dispatch({
			type: `${this._config.moduleName}/replaceLocale`,
			locale: locale,
			translations: translations
		});
	};

	// remove the givne locale from the store
	removeLocale(locale) {
		if (this._store.state[this._config.moduleName].translations.hasOwnProperty(locale)) {
			this._store.dispatch({
				type: `${this._config.moduleName}/removeLocale`,
				locale: locale
			});
		}
	};

	// we are phasing out the exists function
	phaseOutExistsFn(locale) {
		if (this._config.warnings) console.warn('i18n: $i18n.exists is depreceated. Please use $i18n.localeExists instead. It provides exactly the same functionality.');
		return this.checkLocaleExists(locale);
	};

	// check if the given locale is already loaded
	checkLocaleExists(locale) {
		return this._store.state[this._config.moduleName].translations.hasOwnProperty(locale);
	};

	install(app, store) {
		// define module name and identifiers as constants to prevent any changes
		const moduleName = this._config.moduleName;
		const identifiers = this._config.identifiers;
		const translateFilterName = this._config.translateFilterName;
		const translateInFilterName = this._config.translateInFilterName;

		this._store = store;

		// register the i18n module in the vuex store
		// preserveState can be used via configuration if server side rendering is used
		store.registerModule(moduleName, module, { preserveState: this._config.preserveState });

		// check if the plugin was correctly initialized
		if (store.state.hasOwnProperty(moduleName) === false) {
			console.error('i18n: i18n vuex module is not correctly initialized. Please check the module name:', moduleName);

			// always return the key if module is not initialized correctly
			app.config.globalProperties.$i18n = function(key) {
				return key;
			};

			app.config.globalProperties.$getLanguage = function() {
				return null;
			};

			app.config.globalProperties.$setLanguage = function() {
				console.error('i18n: i18n vuex module is not correctly initialized');
			};

			return;
		}







		// register vue prototype methods
		app.config.globalProperties.$i18n = {
			locale: this.getLocale,
			locales: this.getLocales,
			set: this.setLocale,
			add: this.addLocale,
			replace: this.replaceLocale,
			remove: this.removeLocale,
			fallback: this.setFallbackLocale,
			localeExists: this.checkLocaleExists,
			keyExists: this.checkKeyExists,

			translate: this.translate,
			translateIn: this.translateInLanguage,

			exists: this.phaseOutExistsFn
		};

		// register global methods
		// todo: fix it

		app.i18n = {
			locale: this.getLocale,
			locales: this.getLocales,
			set: this.setLocale,
			add: this.addLocale,
			replace: this.replaceLocale,
			remove: this.removeLocale,
			fallback: this.setFallbackLocale,
			translate: this.translate,
			translateIn: this.translateInLanguage,
			localeExists: this.checkLocaleExists,
			keyExists: this.checkKeyExists,

			exists: this.phaseOutExistsFn
		};

		// register the translation function on the vue instance directly
		app.config.globalProperties.$t = this.translate;

		// register the specific language translation function on the vue instance directly
		app.config.globalProperties.$tlang = this.translateInLanguage;

		// register a filter function for translations
		// todo: fix it

		// Vue.filter(translateFilterName, translate);
		// Vue.filter(translateInFilterName, translateInLanguageFilter);
	}
}
