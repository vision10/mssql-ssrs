## Change Log

### v2.0.2 TODO
- support for http ntlm 2
### v2.0.1
- bug fix
### v2.0.0
- update packages (soap v40+ dropped request and httpntlm in favour of axios and axios-ntlm)
- drop internal promisify function, using soap async functions (returned result may change)
- rewritten functionality using classes (big changes)
- documentation updates

### v1.4.1
- update packages
- new option for upload reports `options` when deleting existing items - `keepDataSource` (default: false)

### v1.4.0
- some documentation updates
- droped internal NtlmSecurity, use soap ntlm security (NTLMSecurity)
- update packages (dropped lodash, replace moment=>dayjs)
- new `createClient` on reportService and reportExecution for multiple clients with diferent configurations

### v1.3.9 - v1.3.12
- bug fix

### v1.3.8
- auto convert definition parameter on `createReport` to base64 string

### v1.3.2 - v1.3.7 
- added `include` array to `uploadFiles`
- bug fixes to `fixDataSourceReference`, `upload`
- documentation update
- packages update to latest

### v1.3.1

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