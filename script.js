const canvas = document.getElementById('webglCanvas');
const gl = canvas.getContext('webgl');

canvas.width = canvas.clientWidth * 1.5;
canvas.height = canvas.clientHeight * 1.5;
gl.viewport(0, 0, canvas.width, canvas.height);

if (!gl) {
    alert("Votre navigateur ne supporte pas WebGL.");
}

let highlightBoxes = [0, 0, 0];
const boxPositions = [
    [0.0, 1.0, 6.0],
    [-3.0, 1.0, 6.0],
    [3.0, 1.0, 6.0]
];

const songAudio = new Audio("audio.mp3");
let currentSecond = 0;
let particles = [];

function playNextSecond() {
    if (currentSecond >= songAudio.duration) {
        currentSecond = 0;
    }

    songAudio.currentTime = currentSecond;
    songAudio.play();

    setTimeout(() => {
        songAudio.pause();
        currentSecond += 0.5;
    }, 500);
}

function generateParticles(position) {
    const numParticles = 100; 
    for (let i = 0; i < numParticles; i++) {
        particles.push({
            position: [...position],
            velocity: [
                (Math.random() - 0.5) * 0.15,
                (Math.random() - 0.5) * 0.15,
                (Math.random() - 0.5) * 0.15
            ],
            life: 1.0
        });
    }
    if (particles.length > 500) particles.splice(0, particles.length - 500); 
}

canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / canvas.clientWidth * 2.0 - 1.0;

    const clickedBoxIndex = (x < -0.5) ? 1 : (x > 0.5) ? 2 : 0;

    highlightBoxes.fill(0);
    highlightBoxes[clickedBoxIndex] = 1;
    playNextSecond();
    generateParticles(boxPositions[clickedBoxIndex]);
});

const vertexShaderSource = `
    attribute vec4 position;
    void main() {
        gl_Position = position;
    }
`;

const fragmentShaderSource = `
    precision highp float;

    #define MAX_STEPS 64   
    #define MAX_DIST 100.
    #define SURF_DIST .001

    uniform vec2 iResolution;
    uniform float iTime;
    uniform int highlightBox0;
    uniform int highlightBox1;
    uniform int highlightBox2;

    uniform vec3 boxPosition0;
    uniform vec3 boxPosition1;
    uniform vec3 boxPosition2;

    uniform vec3 particlePositions[500];
    uniform float particleLifes[500];

    vec3 getBoxPosition(int index) {
        if (index == 0) return boxPosition0;
        if (index == 1) return boxPosition1;
        if (index == 2) return boxPosition2;
        return vec3(0.0);
    }

    int getBoxHighlight(int index) {
        if (index == 0) return highlightBox0;
        if (index == 1) return highlightBox1;
        if (index == 2) return highlightBox2;
        return 0;
    }

    float dBox(vec3 p, vec3 s) {
        return length(max(abs(p) - s, 0.0));
    }

    float dPlane(vec3 p) {
        return p.y;
    }

    float GetDist(vec3 p, out int objID) {
        float minDist = MAX_DIST;
        objID = -1;

        for (int i = 0; i < 3; i++) {
            float dist = dBox(p - getBoxPosition(i), vec3(1.0, 0.75, 1.0));
            if (dist < minDist) {
                minDist = dist;
                objID = i + 1;
            }
        }

        float planeDist = dPlane(p);
        if (planeDist < minDist) {
            minDist = planeDist;
            objID = 0;
        }

        return minDist;
    }

    float RayMarch(vec3 ro, vec3 rd, out int objID) {
        float dO = 0.0;
        
        for(int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * dO;
            float dS = GetDist(p, objID);
            dO += dS;
            if(dO > MAX_DIST || dS < SURF_DIST) break;
        }
        
        return dO;
    }

    vec3 GetNormal(vec3 p) {
        int unusedID;
        float d = GetDist(p, unusedID);
        vec2 e = vec2(.001, 0);
        
        vec3 n = d - vec3(
            GetDist(p - e.xyy, unusedID),
            GetDist(p - e.yxy, unusedID),
            GetDist(p - e.yyx, unusedID)
        );
        
        return normalize(n);
    }

    float GetLight(vec3 p) {
        int unusedID;
        vec3 lightPos = vec3(2.0, 5.0, 6.0);
        vec3 l = normalize(lightPos - p);
        vec3 n = GetNormal(p);
        
        float diffuse = clamp(dot(n, l), 0.0, 1.0);
        float d = RayMarch(p + n * SURF_DIST * 2.0, l, unusedID);
        if(d < length(lightPos - p)) diffuse *= 0.1;
        
        float ambient = 0.2;
        return diffuse + ambient;
    }

    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
        
        vec3 colorNormal = vec3(0.8, 0.8, 0.8);
        vec3 colorHighlight = vec3(1.0, 1.0, 0.0);
        vec3 colorPlane = vec3(0.5, 0.5, 0.5);

        vec3 ro = vec3(0, 2, 0);
        vec3 rd = normalize(vec3(uv.x, uv.y, 1.0));
        int objID;

        float d = RayMarch(ro, rd, objID);
        vec3 p = ro + rd * d;

        vec3 finalColor;
        if (objID > 0) {
            int boxIndex = objID - 1;
            bool isHighlighted = getBoxHighlight(boxIndex) == 1;
            finalColor = isHighlighted ? colorHighlight : colorNormal;
        } else {
            finalColor = colorPlane;
        }

        float dif = GetLight(p);
        finalColor *= dif;
        
        for (int i = 0; i < 500; i++) { 
            float life = particleLifes[i];
            if (life > 0.0) {
                vec3 particlePos = particlePositions[i];
                float dist = length(p - particlePos);
                if (dist < 0.1) {
                    finalColor += vec3(1.0, 0.5, 0.1) * life * (0.1 - dist) * 10.0;
                }
            }
        }

        fragColor = vec4(pow(finalColor, vec3(.4545)), 1.0);
    }

    void main() {
        mainImage(gl_FragColor, gl_FragCoord.xy);
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
}

gl.useProgram(program);
const positionLocation = gl.getAttribLocation(program, 'position');
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 
     1, -1,
    -1,  1, 
    -1,  1, 
     1, -1, 
     1,  1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

const resolutionLocation = gl.getUniformLocation(program, 'iResolution');
const timeLocation = gl.getUniformLocation(program, 'iTime');
const highlightBox0Location = gl.getUniformLocation(program, 'highlightBox0');
const highlightBox1Location = gl.getUniformLocation(program, 'highlightBox1');
const highlightBox2Location = gl.getUniformLocation(program, 'highlightBox2');
const boxPositionLocations = [
    gl.getUniformLocation(program, 'boxPosition0'),
    gl.getUniformLocation(program, 'boxPosition1'),
    gl.getUniformLocation(program, 'boxPosition2')
];
const particlePositionsLocation = gl.getUniformLocation(program, 'particlePositions');
const particleLifesLocation = gl.getUniformLocation(program, 'particleLifes');

gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
boxPositions.forEach((pos, index) => {
    gl.uniform3f(boxPositionLocations[index], ...pos);
});

function render(time) {
    gl.uniform1f(timeLocation, time * 0.001);
    gl.uniform1i(highlightBox0Location, highlightBoxes[0]);
    gl.uniform1i(highlightBox1Location, highlightBoxes[1]);
    gl.uniform1i(highlightBox2Location, highlightBoxes[2]);

    const particlePos = new Float32Array(500 * 3);
    const particleLife = new Float32Array(500);
    particles = particles.filter(p => p.life > 0);
    particles.forEach((p, i) => {
        p.position[0] += p.velocity[0];
        p.position[1] += p.velocity[1];
        p.position[2] += p.velocity[2];
        p.life -= 0.02;
        particlePos.set(p.position, i * 3);
        particleLife[i] = p.life;
    });

    gl.uniform3fv(particlePositionsLocation, particlePos);
    gl.uniform1fv(particleLifesLocation, particleLife);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}

render();
