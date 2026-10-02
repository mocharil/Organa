const {activeCompany}=require('./helpers');
class CompanyService{constructor({stateManager}){this.stateManager=stateManager;}get(){return activeCompany(this.stateManager.get());}list(){return this.stateManager.get().companies||[];}}
module.exports={CompanyService};
