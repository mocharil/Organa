const header=document.querySelector('.site-header');
const toggle=document.querySelector('.nav-toggle');
if(toggle&&header){
  toggle.addEventListener('click',()=>{
    const expanded=toggle.getAttribute('aria-expanded')==='true';
    toggle.setAttribute('aria-expanded',String(!expanded));
    header.classList.toggle('open',!expanded);
  });
  document.querySelectorAll('.site-nav a,.nav-cta a,.nav-cta button').forEach(control=>{
    control.addEventListener('click',()=>{
      header.classList.remove('open');
      toggle.setAttribute('aria-expanded','false');
    });
  });
}

const videoDialog=document.getElementById('demoVideoDialog');
const demoVideo=document.getElementById('organaDemoVideo');
function openDemoVideo(){
  if(!videoDialog)return;
  if(!videoDialog.open)videoDialog.showModal();
  if(demoVideo){
    demoVideo.currentTime=0;
    const play=demoVideo.play();
    if(play?.catch)play.catch(()=>{});
  }
}
function closeDemoVideo(){
  if(demoVideo)demoVideo.pause();
  if(videoDialog?.open)videoDialog.close();
}
document.querySelectorAll('[data-video-open]').forEach(button=>button.addEventListener('click',openDemoVideo));
document.querySelectorAll('[data-video-close]').forEach(button=>button.addEventListener('click',closeDemoVideo));
videoDialog?.addEventListener('click',event=>{if(event.target===videoDialog)closeDemoVideo();});
videoDialog?.addEventListener('close',()=>demoVideo?.pause());
