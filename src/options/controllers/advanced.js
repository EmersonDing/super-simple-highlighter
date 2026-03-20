/*
 * This file is part of Super Simple Highlighter.
 * 
 * Super Simple Highlighter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * Super Simple Highlighter is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
 */

// 'aboutControllers' module containing a single controller, named 'about'
angular.module('advancedControllers', []).controller('advanced', ["$scope", function ($scope) {
	class Controller {
    /**
     * Creates an instance of Controller.
     * @param {Object} scope - controller $scope
     * @memberof Controller
     */
		constructor(scope) {
			this.scope = scope

			for (const func of [
				this.onClickExport,
				this.onClickOptimize,
				this.onFilesChange,
				this.onMergeFilesChange
			]) {
				this.scope[func.name] = func.bind(this)
			}

			// TODO: move this to html
			document.querySelector('#files').addEventListener('change', this.onFilesChange)
			document.querySelector('#mergeFiles').addEventListener('change', this.onMergeFilesChange.bind(this))

			this.scope.optimizing = false
			this.updateStorageEstimate()
		}

		/**
		 * Format bytes into a human-readable string
		 *
		 * @param {number} bytes
		 * @returns {string}
		 */
		static formatBytes(bytes) {
			if (bytes < 1024) return `${bytes} B`
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
			if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
			return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
		}

		/**
		 * Fetch storage estimate and update scope
		 */
		updateStorageEstimate() {
			navigator.storage.estimate().then(({usage, quota}) => {
				this.scope.storageUsed = chrome.i18n.getMessage(
					"advanced_storage_usage_label", [Controller.formatBytes(usage)]
				)
				this.scope.storagePercent = quota > 0 ? Math.min((usage / quota) * 100, 100).toFixed(2) : 0
				this.scope.$apply()
			}).catch(() => {
				this.scope.storageUsed = chrome.i18n.getMessage("advanced_storage_unavailable")
				this.scope.storagePercent = 0
				this.scope.$apply()
			})
		}

		/**
		 * Handle click on Compact & Optimize button
		 */
		onClickOptimize() {
			this.scope.optimizing = true
			this.scope.optimizeError = null

			new DB().optimizeDB().then(() => {
				this.updateStorageEstimate()
			}).catch(() => {
				this.scope.optimizeError = chrome.i18n.getMessage("advanced_optimize_error")
			}).finally(() => {
				this.scope.optimizing = false
				this.scope.$apply()
			})
		}

    /**
     * @typedef {Object} Header
     * @prop {string} magic
     * @prop {number} version
     */

    /**
     * A file was selected for import
     * 
     * @memberof Controller
     */
		onFilesChange() {
			// @ts-ignore
			const file = /** @type {DataTransfer} */ (event.target).files[0]
			const reader = new FileReader()

			// definitions have to be parsed before they're used
			let storageItems

			// Closure to capture the file information.
			reader.onload = () => {
				// newline delimited json
				const ldjson = /** @type {FileReader} */ (event.target).result
				const jsonObjects = ldjson.split('\n').filter(line => line.length > 0)

				// newline delimited json
				return new Promise((resolve, reject) => {
					// validate header

					/** @type {Header} */
					const header = JSON.parse(jsonObjects.shift())

					if (header.magic !== Controller.MAGIC || header.version !== 1) {
						reject({
							status: 403,
							message: "Invalid File"
						});
					} else {
						resolve()
					}
				}).then(() => {
					//     return new Promise(resolve => { chrome.runtime.getBackgroundPage(p => resolve(p)) })
					// }).then(({factory}) => {
					// the first line-delimited json object is the storage highlights object. 
					// Don't use them until the database loads successfully remainder is the database
					storageItems = JSON.parse(jsonObjects.shift());						

					// load remainder, which is just the replicated stream
					return new DB().loadDB(jsonObjects.join('\n'))
				}).then(() => {
					// set associated styles. null items are removed (implying default should be used)
					return new ChromeHighlightStorage().setAll(storageItems)
				}).then(() => {
					location.reload();
				}).catch(function (err) {
					// error loading or replicating tmp db to main db
					alert(`Error importing backup\n\nStatus: ${err.status}\nMessage: ${err.message}`)
				})
			}

			// Read in the image file as a data URL.
			reader.readAsText(file, "utf-8");
			// reader.readAsDataURL(file);
		}

		/**
		 * Handle file selection for the Merge feature.
		 * Merges highlights from a backup file with the current DB, deduplicating by content.
		 */
		async onMergeFilesChange(event) {
			const file = event.target.files[0]
			if (!file) return

			const ldjson = await file.text()
			const lines = ldjson.split('\n').filter(line => line.length > 0)

			// Validate header
			let header
			try {
				header = JSON.parse(lines[0])
			} catch (e) {
				alert('Error merging backup\n\nStatus: 400\nMessage: Invalid file (bad JSON)')
				return
			}
			if (header.magic !== Controller.MAGIC || header.version !== 1) {
				alert('Error merging backup\n\nStatus: 403\nMessage: Invalid file')
				return
			}

			// Remaining lines: storageItems on line 2, rest is DB stream
			const backupStream = lines.slice(2).join('\n')

			let tmpDB = null
			let mergeOutDB = null

			try {
				const ts = Date.now()
				// Step 1: Extract backup CREATE docs from a temporary PouchDB
				tmpDB = new PouchDB(`_mergetmpdb_${ts}`, { storage: 'temporary' })
				await tmpDB.load(backupStream)
				const allBackupRows = (await tmpDB.allDocs({ include_docs: true })).rows
				const backupDocs = allBackupRows
					.map(r => r.doc)
					.filter(d => d && d.verb === DB.DOCUMENT.VERB.CREATE)
				await tmpDB.destroy()
				tmpDB = null

				// Step 2: Get net-active CREATE docs from current DB
				const allCurrentDocs = await new DB().getAllDocuments()
				const deletedIds = new Set(
					allCurrentDocs
						.filter(d => d.verb === DB.DOCUMENT.VERB.DELETE)
						.map(d => d[DB.DOCUMENT.NAME.CORRESPONDING_DOC_ID])
				)
				const currentDocs = allCurrentDocs.filter(
					d => d.verb === DB.DOCUMENT.VERB.CREATE && !deletedIds.has(d._id)
				)

				// Step 3: Fetch current storage items (style definitions — do NOT merge from backup)
				const currentStorageItems = await new ChromeHighlightStorage().getAll({ defaults: false })

				// Step 4: Merge
				const mergedDocs = mergeHighlightDocs(currentDocs, backupDocs)

				// Step 5: Confirm with user
				const confirmed = window.confirm(
					`Merge will grow from ${currentDocs.length} → ${mergedDocs.length} highlights. Continue?`
				)
				if (!confirmed) return

				// Step 6: Build merged ldjson via a fresh tmpDB dump
				mergeOutDB = new PouchDB(`_mergeout_${ts}`, { storage: 'temporary' })
				await mergeOutDB.bulkDocs(
					mergedDocs.map(d => { const c = { ...d }; delete c._rev; return c })
				)
				const stream = new window.memorystream()
				let mergedStream = ''
				stream.on('data', chunk => { mergedStream += chunk.toString() })
				await mergeOutDB.dump(stream)
				await mergeOutDB.destroy()
				mergeOutDB = null

				const mergedLdjson = [
					JSON.stringify({ magic: Controller.MAGIC, version: 1 }),
					JSON.stringify(currentStorageItems),
					mergedStream,
				].join('\n')

				// Step 7: Load merged DB (replaces current DB) and reload page
				await new DB().loadDB(mergedLdjson)
				location.reload()

			} catch (err) {
				// Cleanup any in-flight tmpDBs
				if (tmpDB) await tmpDB.destroy().catch(() => {})
				if (mergeOutDB) await mergeOutDB.destroy().catch(() => {})
				alert(`Error merging backup\n\nStatus: ${err.status || 500}\nMessage: ${err.message || err}`)
			}
		}

		onClickExport() {
			/** @type {Header} */
			const header = {
				magic: Controller.MAGIC,
				version: 1,
			}

			// start with header
			let ldjson = JSON.stringify(header)

			return new ChromeHighlightStorage().getAll({ defaults: false }).then(items => {
				// the first item (after header) is always the highlights object
				ldjson += `\n${JSON.stringify(items)}`

				// the remainder is the dumped database
				const stream = new window.memorystream();

				stream.on('data', chunk => {
					ldjson += `\n${chunk.toString()}`;
				})

				return new DB().dumpDB(stream)
			}).then(() => {
				// create a temporary anchor to navigate to data uri
				const elm = document.createElement("a")

				elm.download = `${chrome.i18n.getMessage("advanced_database_export_file_name")}.ldjson`
				elm.href = "data:text;base64," + Base64Utils.utf8_to_b64(ldjson, window)

				// a.href = "data:text/plain;charset=utf-8;," + encodeURIComponent(dumpedString);
				// a.href = "data:text;base64," + utf8_to_b64(dumpedString);
				// a.href = "data:text;base64," + utf8_to_b64(dumpedString);
				//window.btoa(dumpedString);

				// create & dispatch mouse event to hidden anchor
				const event = document.createEvent("MouseEvent")

				event.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null)
				elm.dispatchEvent(event)
			})
		}
	} // end class

	// static properties

	Controller.MAGIC = 'Super Simple Highlighter Exported Database'

	// initialize
	new Controller($scope)
}])