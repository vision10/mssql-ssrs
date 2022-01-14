const Soap = require('./soap');

module.exports = {
    createSoapInstance: function createSoapInstance(url, options) {
        return new Soap(url, (options || {}).rootFolder)
    },
    testReportPath: function testReportPath(rootFolder, reportPath) {
        return rootFolder && !new RegExp('^' + rootFolder).test(reportPath) ? rootFolder + reportPath : reportPath;
    },
    reportFileFormat: function reportFormat(fileType) {
        fileType = fileType && fileType.toUpperCase();
        switch (fileType) {
            case 'EXCELOPENXML': case 'EXCEL': case 'XLS': case 'XLSX': return 'EXCELOPENXML';
            case 'WORDOPENXML': case 'WORD': case 'DOC': case 'DOCX': return 'WORDOPENXML';
            default: return fileType || 'PDF';
        }
    },
    errorHandler: function errorHandler(err) {
        const message = err && err.root && err.root.Envelope && err.root.Envelope.Body && err.root.Envelope.Body.Fault.faultstring;
        throw new Error(message || (err && err.message) || err);
    }
}