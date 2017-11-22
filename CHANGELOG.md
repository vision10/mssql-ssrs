## Change Log

### v0.1.0 first release

### v0.1.0 - v0.1.11 bug fix and documentation

### v0.2.0 

- bug fix for: `upload`, added debug option, 
- added: `fixDataSourceReference`
- added: `getItemReferences`, `setItemReferences`
- restricted `getServerUrl`, `setServerUrl`, `getRootFolder`, `setRootFolder`, 
    - not exported outside the package
- documentation updates

### v0.3.0

- documentation updates
- option `useRs2010` on reportService start function has been changed to `useRs2012`
    - still defaults to using 2010
- fixed issue with other types of security than ntlm
    - basic security works for now
    - others will be added later