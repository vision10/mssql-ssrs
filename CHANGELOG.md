## Change Log

### v1.3.0

- consistent parameters for all start functions `report.start`, `reportService.start` and `reportExecution.start` 
- documentation updates
- minor buxfix

### v1.2.2 - v1.2.4

- bug fix

### v1.2.1

- packages update 

### v1.2.0

- modified `download` returned result
- fixed some minor issues with `getReportByUrl`
- exported `setServerUrl`

### v1.1.0

- documentation update
- added `readFiles`
- `upload` and `uploadFiles` options changed
    - `deleteReports` option changed to `deleteExistingItems`
    - `auth` option changed to `dataSourceOptions`
    - removed `debug` option 
    - added `logger` object with `log` and `warn` functions, or boolean(outputs to console)
    - added `exclude` array for `uploadFiles`, can exclude by name, extension, path
- added `log` parameter to `fixDataSourceReference` 

### v1.0.0

- documentation update
- replace custom soap package with original
    - default to ntlm request, does not override request if othes security is passed
    - auth option changed to [soap config](https://www.npmjs.com/package/soap#options)
- export entire original soap not just custom `createClient` and `security`
- other small improvements

### v0.3.0

- documentation updates
- option `useRs2010` on reportService start function has been changed to `useRs2012`
    - still defaults to using 2010
- fixed issue with other types of security than ntlm
    - suport for basic security

### v0.2.0 

- bug fix for: `upload`, added debug option, 
- added: `fixDataSourceReference`
- added: `getItemReferences`, `setItemReferences`
- restricted `getServerUrl`, `setServerUrl`, `getRootFolder`, `setRootFolder`, 
    - not exported outside the package
- documentation updates

### v0.1.0 - v0.1.11 bug fix and documentation

### v0.1.0 first release