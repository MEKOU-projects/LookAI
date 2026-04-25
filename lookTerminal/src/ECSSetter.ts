export class ECSSetter{

    public _lastObjectsCount: number = 0;
    
    public setECSStats(objects: number, components: number, systems: number): void {
        const container = document.getElementById('obj-ecs');
        if (!container) return;

        const spans = container.querySelectorAll('span');
        if (spans.length >= 3) {
            // padStartで桁数を揃えると「計器」っぽさが出ます
            spans[0].innerHTML = `&gt; OBJECTS: ${objects.toString().padStart(2, '0')}`;
            spans[1].innerHTML = `&gt; COMPONENTS: ${components.toString().padStart(2, '0')}`;
            spans[2].innerHTML = `&gt; DEVICES: ${systems.toString().padStart(2, '0')}`; 
        }
    }

}