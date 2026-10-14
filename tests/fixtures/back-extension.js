// Generic API v1 test data only. No product-specific UI, state or business code.
export function createBackFixture(doc,{id='test.back.layers',layers=3}={}){
 let api,panel,stack=[],calls=0,factories=0,request;
 const manifest={schemaVersion:1,apiVersion:1,id,name:'Back capability fixture',version:'1.0.0',contributes:{launcher:{title:'Back fixture'}}};
 return {manifest,
  factory(context){api=context;factories++;return {
   activate(){
    panel=doc.createElement('section');panel.tabIndex=-1;panel.dataset.backFixture=id;
    panel.append(doc.createTextNode('Generic main page'));
    stack=Array.from({length:layers},(_,i)=>{const layer=doc.createElement('div');layer.textContent='Internal layer '+(i+1);panel.append(layer);return layer;});
    doc.body.append(panel);api.attachPanel(panel);api.onCleanup(()=>panel.remove());
    api.registerBackHandler(value=>{request=value;calls++;if(!stack.length)return false;stack.pop().remove();return true;});
   },open(){return api.showPanel();},
  };},
  get api(){return api;},get panel(){return panel;},get remaining(){return stack.length;},
  get calls(){return calls;},get factories(){return factories;},get request(){return request;},
 };
}
