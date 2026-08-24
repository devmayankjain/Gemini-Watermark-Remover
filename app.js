"use strict";

// ============================================================
// GEMINI WATERMARK REMOVER
// Alpha-Aware Local Reconstruction
// Browser Based Image Processing
// ============================================================


// ============================================================
// GET HTML ELEMENTS
// ============================================================

const imageInput = document.getElementById("imageInput");
const imageCanvas = document.getElementById("imageCanvas");
const selectionCanvas = document.getElementById("selectionCanvas");

const imageCtx = imageCanvas.getContext("2d", {
    willReadFrequently: true
});

const selectionCtx = selectionCanvas.getContext("2d", {
    willReadFrequently: true
});

const removeButton = document.getElementById("removeButton");
const undoButton = document.getElementById("undoButton");
const resetButton = document.getElementById("resetButton");
const downloadButton = document.getElementById("downloadButton");

const editor = document.getElementById("editor");


// ============================================================
// VARIABLES
// ============================================================

let isSelecting = false;

let startX = 0;
let startY = 0;

let endX = 0;
let endY = 0;

let originalImageData = null;
let currentImageData = null;

let history = [];

let selection = null;

let currentObjectURL = null;


// ============================================================
// SETTINGS
// ============================================================

// Distance used to inspect pixels around the watermark.
const ANALYSIS_RADIUS = 12;

// Width of the surrounding area used for reconstruction.
const CONTEXT_RADIUS = 24;

// Number of iterations used for reconstruction.
const RECONSTRUCTION_PASSES = 3;

// Edge blending area.
const EDGE_FEATHER = 5;

// Maximum number of samples used when estimating background.
const MAX_SAMPLES = 32;

// Prevent extreme alpha division.
const MIN_ALPHA = 0.08;

// Maximum alpha that will be assumed automatically.
const MAX_ALPHA = 0.88;


// ============================================================
// IMAGE FITTING
// ============================================================

function fitEditorToImage() {

    if (!imageCanvas.width || !imageCanvas.height) {
        return;
    }

    if (!editor) {
        return;
    }

    editor.style.width = "100%";
    editor.style.height = "auto";

}


// ============================================================
// DRAW CURRENT IMAGE
// ============================================================

function renderImage() {

    if (!currentImageData) {
        return;
    }

    imageCtx.clearRect(
        0,
        0,
        imageCanvas.width,
        imageCanvas.height
    );

    imageCtx.putImageData(
        currentImageData,
        0,
        0
    );
}


// ============================================================
// CLONE IMAGE DATA
// ============================================================

function cloneImageData(data) {

    return new ImageData(
        new Uint8ClampedArray(data.data),
        data.width,
        data.height
    );
}


// ============================================================
// LOAD IMAGE
// ============================================================

function loadImage(file) {

    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {

        console.error(
            "Please select a valid image."
        );

        return;
    }


    const image = new Image();

    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
    }

    currentObjectURL =
        URL.createObjectURL(file);


    image.onload = function () {

        // --------------------------------------------
        // SET REAL IMAGE SIZE
        // --------------------------------------------

        imageCanvas.width = image.naturalWidth;
        imageCanvas.height = image.naturalHeight;

        selectionCanvas.width =
            image.naturalWidth;

        selectionCanvas.height =
            image.naturalHeight;


        // --------------------------------------------
        // DRAW IMAGE
        // --------------------------------------------

        imageCtx.clearRect(
            0,
            0,
            imageCanvas.width,
            imageCanvas.height
        );

        imageCtx.drawImage(
            image,
            0,
            0,
            image.naturalWidth,
            image.naturalHeight
        );


        // --------------------------------------------
        // SAVE ORIGINAL
        // --------------------------------------------

        originalImageData =
            imageCtx.getImageData(
                0,
                0,
                imageCanvas.width,
                imageCanvas.height
            );


        currentImageData =
            cloneImageData(
                originalImageData
            );


        // --------------------------------------------
        // RESET STATE
        // --------------------------------------------

        history = [];

        selection = null;

        isSelecting = false;


        selectionCtx.clearRect(
            0,
            0,
            selectionCanvas.width,
            selectionCanvas.height
        );


        fitEditorToImage();

        renderImage();


        console.log(
            "Image loaded:",
            image.naturalWidth,
            "x",
            image.naturalHeight
        );


        URL.revokeObjectURL(
            currentObjectURL
        );

        currentObjectURL = null;

    };


    image.onerror = function () {

        console.error(
            "Could not load image."
        );

    };


    image.src =
        currentObjectURL;
}


// ============================================================
// NORMAL FILE UPLOAD
// ============================================================

imageInput.addEventListener(
    "change",
    function (event) {

        const file =
            event.target.files[0];

        loadImage(file);

    }
);


// ============================================================
// DRAG & DROP
// ============================================================

if (editor) {

    editor.addEventListener(
        "dragover",
        function (event) {

            event.preventDefault();

            editor.classList.add(
                "drag-active"
            );

        }
    );


    editor.addEventListener(
        "dragleave",
        function () {

            editor.classList.remove(
                "drag-active"
            );

        }
    );


    editor.addEventListener(
        "drop",
        function (event) {

            event.preventDefault();

            editor.classList.remove(
                "drag-active"
            );


            const files =
                event.dataTransfer.files;


            if (!files || !files.length) {
                return;
            }


            loadImage(
                files[0]
            );

        }
    );

}


// ============================================================
// CANVAS COORDINATES
// IMPORTANT WHEN CANVAS IS CSS SCALED
// ============================================================

function getCanvasCoordinates(event) {

    const rect =
        selectionCanvas.getBoundingClientRect();


    if (
        rect.width <= 0 ||
        rect.height <= 0
    ) {

        return {
            x: 0,
            y: 0
        };

    }


    const scaleX =
        selectionCanvas.width /
        rect.width;


    const scaleY =
        selectionCanvas.height /
        rect.height;


    let x =
        (event.clientX - rect.left) *
        scaleX;


    let y =
        (event.clientY - rect.top) *
        scaleY;


    x =
        Math.max(
            0,
            Math.min(
                selectionCanvas.width - 1,
                x
            )
        );


    y =
        Math.max(
            0,
            Math.min(
                selectionCanvas.height - 1,
                y
            )
        );


    return {
        x,
        y
    };
}


// ============================================================
// DRAW SELECTION
// ============================================================

function drawSelection() {

    selectionCtx.clearRect(
        0,
        0,
        selectionCanvas.width,
        selectionCanvas.height
    );


    if (!selection) {
        return;
    }


    const x =
        selection.x;

    const y =
        selection.y;

    const width =
        selection.width;

    const height =
        selection.height;


    // Selection background
    selectionCtx.fillStyle =
        "rgba(255, 70, 70, 0.18)";


    selectionCtx.fillRect(
        x,
        y,
        width,
        height
    );


    // Main border
    selectionCtx.strokeStyle =
        "#ff3b30";

    selectionCtx.lineWidth =
        2;


    selectionCtx.strokeRect(
        x,
        y,
        width,
        height
    );


    // Inner dashed border
    selectionCtx.strokeStyle =
        "rgba(255,255,255,0.95)";

    selectionCtx.lineWidth =
        1;

    selectionCtx.setLineDash([
        5,
        5
    ]);


    selectionCtx.strokeRect(
        x + 2,
        y + 2,
        Math.max(
            0,
            width - 4
        ),
        Math.max(
            0,
            height - 4
        )
    );


    selectionCtx.setLineDash([]);

}


// ============================================================
// MOUSE DOWN
// ============================================================

selectionCanvas.addEventListener(
    "mousedown",
    function (event) {

        if (!currentImageData) {

            console.log(
                "Please upload an image first."
            );

            return;
        }


        const point =
            getCanvasCoordinates(event);


        isSelecting = true;


        startX =
            point.x;

        startY =
            point.y;


        endX =
            startX;

        endY =
            startY;


        selection = null;


        selectionCtx.clearRect(
            0,
            0,
            selectionCanvas.width,
            selectionCanvas.height
        );

    }
);


// ============================================================
// MOUSE MOVE
// ============================================================

selectionCanvas.addEventListener(
    "mousemove",
    function (event) {

        if (!isSelecting) {
            return;
        }


        const point =
            getCanvasCoordinates(event);


        endX =
            point.x;

        endY =
            point.y;


        const x =
            Math.min(
                startX,
                endX
            );


        const y =
            Math.min(
                startY,
                endY
            );


        const width =
            Math.abs(
                endX - startX
            );


        const height =
            Math.abs(
                endY - startY
            );


        selectionCtx.clearRect(
            0,
            0,
            selectionCanvas.width,
            selectionCanvas.height
        );


        selectionCtx.fillStyle =
            "rgba(255, 70, 70, 0.18)";


        selectionCtx.fillRect(
            x,
            y,
            width,
            height
        );


        selectionCtx.strokeStyle =
            "#ff3b30";

        selectionCtx.lineWidth =
            2;


        selectionCtx.strokeRect(
            x,
            y,
            width,
            height
        );

    }
);


// ============================================================
// MOUSE UP
// ============================================================

selectionCanvas.addEventListener(
    "mouseup",
    function (event) {

        if (!isSelecting) {
            return;
        }


        isSelecting = false;


        const point =
            getCanvasCoordinates(event);


        endX =
            point.x;

        endY =
            point.y;


        const x =
            Math.min(
                startX,
                endX
            );


        const y =
            Math.min(
                startY,
                endY
            );


        const width =
            Math.abs(
                endX - startX
            );


        const height =
            Math.abs(
                endY - startY
            );


        if (
            width < 2 ||
            height < 2
        ) {

            selection = null;

            selectionCtx.clearRect(
                0,
                0,
                selectionCanvas.width,
                selectionCanvas.height
            );

            return;
        }


        selection = {

            x: Math.round(x),

            y: Math.round(y),

            width: Math.round(width),

            height: Math.round(height)

        };


        drawSelection();


        console.log(
            "Selected area:",
            selection
        );

    }
);


// ============================================================
// MOUSE LEAVE
// ============================================================

selectionCanvas.addEventListener(
    "mouseleave",
    function () {

        if (isSelecting) {

            isSelecting = false;

        }

    }
);


// ============================================================
// GET PIXEL
// ============================================================

function getPixel(
    data,
    x,
    y
) {

    const width =
        imageCanvas.width;

    const height =
        imageCanvas.height;


    x =
        Math.round(x);

    y =
        Math.round(y);


    if (
        x < 0 ||
        y < 0 ||
        x >= width ||
        y >= height
    ) {

        return null;
    }


    const index =
        (
            y *
            width +
            x
        ) * 4;


    return {

        r: data[index],

        g: data[index + 1],

        b: data[index + 2],

        a: data[index + 3]

    };
}


// ============================================================
// PIXEL INDEX
// ============================================================

function getIndex(
    x,
    y
) {

    return (
        y *
        imageCanvas.width +
        x
    ) * 4;
}


// ============================================================
// CLAMP
// ============================================================

function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


// ============================================================
// COLOR DISTANCE
// ============================================================

function colorDistance(
    a,
    b
) {

    if (!a || !b) {
        return Infinity;
    }


    return (

        Math.abs(
            a.r - b.r
        ) * 0.299

        +

        Math.abs(
            a.g - b.g
        ) * 0.587

        +

        Math.abs(
            a.b - b.b
        ) * 0.114

    );
}


// ============================================================
// LUMINANCE
// ============================================================

function luminance(
    pixel
) {

    if (!pixel) {
        return 0;
    }


    return (
        pixel.r * 0.299 +
        pixel.g * 0.587 +
        pixel.b * 0.114
    );
}


// ============================================================
// GET SURROUNDING PIXELS
// ============================================================

function collectContextPixels(
    data,
    selection
) {

    const pixels = [];


    const x0 =
        Math.max(
            0,
            selection.x -
            CONTEXT_RADIUS
        );


    const y0 =
        Math.max(
            0,
            selection.y -
            CONTEXT_RADIUS
        );


    const x1 =
        Math.min(
            imageCanvas.width - 1,
            selection.x +
            selection.width +
            CONTEXT_RADIUS
        );


    const y1 =
        Math.min(
            imageCanvas.height - 1,
            selection.y +
            selection.height +
            CONTEXT_RADIUS
        );


    for (
        let y = y0;
        y <= y1;
        y++
    ) {

        for (
            let x = x0;
            x <= x1;
            x++
        ) {

            const inside =
                x >= selection.x &&
                x <
                selection.x +
                selection.width &&
                y >= selection.y &&
                y <
                selection.y +
                selection.height;


            if (inside) {
                continue;
            }


            const pixel =
                getPixel(
                    data,
                    x,
                    y
                );


            if (!pixel) {
                continue;
            }


            pixels.push({
                x,
                y,
                pixel
            });

        }

    }


    return pixels;
}


// ============================================================
// MEDIAN
// ============================================================

function median(
    values
) {

    if (!values.length) {
        return 0;
    }


    const sorted =
        values
            .slice()
            .sort(
                (a, b) =>
                    a - b
            );


    const middle =
        Math.floor(
            sorted.length / 2
        );


    if (
        sorted.length % 2 === 0
    ) {

        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;

    }


    return sorted[middle];
}


// ============================================================
// ESTIMATE BACKGROUND COLOR
//
// Uses pixels immediately outside the selection.
// ============================================================

function estimateBackground(
    data,
    x,
    y,
    selection
) {

    const samples = [];


    const radius =
        ANALYSIS_RADIUS;


    // Horizontal samples
    for (
        let i = 1;
        i <= radius;
        i++
    ) {

        const positions = [

            {
                x:
                    selection.x - i,

                y
            },

            {
                x:
                    selection.x +
                    selection.width -
                    1 +
                    i,

                y
            }

        ];


        for (
            let p = 0;
            p < positions.length;
            p++
        ) {

            const pixel =
                getPixel(
                    data,
                    positions[p].x,
                    positions[p].y
                );


            if (pixel) {
                samples.push(pixel);
            }

        }

    }


    // Vertical samples
    for (
        let i = 1;
        i <= radius;
        i++
    ) {

        const positions = [

            {
                x,

                y:
                    selection.y - i

            },

            {
                x,

                y:
                    selection.y +
                    selection.height -
                    1 +
                    i

            }

        ];


        for (
            let p = 0;
            p < positions.length;
            p++
        ) {

            const pixel =
                getPixel(
                    data,
                    positions[p].x,
                    positions[p].y
                );


            if (pixel) {
                samples.push(pixel);
            }

        }

    }


    if (!samples.length) {
        return null;
    }


    const limited =
        samples.slice(
            0,
            MAX_SAMPLES
        );


    return {

        r: Math.round(
            median(
                limited.map(
                    p => p.r
                )
            )
        ),

        g: Math.round(
            median(
                limited.map(
                    p => p.g
                )
            )
        ),

        b: Math.round(
            median(
                limited.map(
                    p => p.b
                )
            )
        ),

        a: 255

    };
}


// ============================================================
// ESTIMATE LOCAL BACKGROUND
//
// Uses opposite-side pixels and interpolation.
// ============================================================

function estimateLocalBackground(
    data,
    x,
    y,
    selection
) {

    const leftDistance =
        x -
        selection.x +
        1;


    const rightDistance =
        selection.x +
        selection.width -
        x;


    const topDistance =
        y -
        selection.y +
        1;


    const bottomDistance =
        selection.y +
        selection.height -
        y;


    const candidates = [];


    // LEFT
    const left =
        getPixel(
            data,
            selection.x -
            leftDistance,
            y
        );


    if (left) {

        candidates.push({
            pixel: left,
            weight:
                1 /
                Math.max(
                    1,
                    leftDistance
                )
        });

    }


    // RIGHT
    const right =
        getPixel(
            data,
            selection.x +
            selection.width -
            1 +
            rightDistance,
            y
        );


    if (right) {

        candidates.push({
            pixel: right,
            weight:
                1 /
                Math.max(
                    1,
                    rightDistance
                )
        });

    }


    // TOP
    const top =
        getPixel(
            data,
            x,
            selection.y -
            topDistance
        );


    if (top) {

        candidates.push({
            pixel: top,
            weight:
                1 /
                Math.max(
                    1,
                    topDistance
                )
        });

    }


    // BOTTOM
    const bottom =
        getPixel(
            data,
            x,
            selection.y +
            selection.height -
            1 +
            bottomDistance
        );


    if (bottom) {

        candidates.push({
            pixel: bottom,
            weight:
                1 /
                Math.max(
                    1,
                    bottomDistance
                )
        });

    }


    if (!candidates.length) {

        return estimateBackground(
            data,
            x,
            y,
            selection
        );

    }


    let r = 0;
    let g = 0;
    let b = 0;
    let weightTotal = 0;


    for (
        let i = 0;
        i < candidates.length;
        i++
    ) {

        const item =
            candidates[i];


        r +=
            item.pixel.r *
            item.weight;


        g +=
            item.pixel.g *
            item.weight;


        b +=
            item.pixel.b *
            item.weight;


        weightTotal +=
            item.weight;

    }


    if (
        weightTotal <= 0
    ) {

        return null;

    }


    return {

        r:
            r /
            weightTotal,

        g:
            g /
            weightTotal,

        b:
            b /
            weightTotal,

        a: 255

    };
}


// ============================================================
// ESTIMATE WATERMARK COLOR
//
// Gemini-like watermark logos are generally brighter than
// the local background. This function estimates the color
// component that may have been added to the image.
// ============================================================

function estimateWatermarkColor(
    watermarked,
    background
) {

    if (
        !watermarked ||
        !background
    ) {

        return {
            r: 255,
            g: 255,
            b: 255
        };

    }


    // Bright neutral watermark assumption.
    // We do not force pure white because the watermark
    // may be anti-aliased or partially transparent.

    const brightness =
        luminance(
            watermarked
        );


    const backgroundBrightness =
        luminance(
            background
        );


    if (
        brightness >=
        backgroundBrightness
    ) {

        return {
            r: 255,
            g: 255,
            b: 255
        };

    }


    // Dark watermark fallback.
    return {
        r: 0,
        g: 0,
        b: 0
    };
}


// ============================================================
// ESTIMATE ALPHA
//
// Solves approximately:
//
// W = O(1-a) + M(a)
//
// Therefore:
//
// a = (W-O)/(M-O)
//
// ============================================================

function estimateAlpha(
    watermarked,
    background,
    watermark
) {

    if (
        !watermarked ||
        !background ||
        !watermark
    ) {

        return 0;

    }


    const values = [];


    const channels = [
        ["r"],
        ["g"],
        ["b"]
    ];


    for (
        let i = 0;
        i < channels.length;
        i++
    ) {

        const key =
            channels[i][0];


        const denominator =
            watermark[key] -
            background[key];


        if (
            Math.abs(
                denominator
            ) < 8
        ) {

            continue;

        }


        const alpha =
            (
                watermarked[key] -
                background[key]
            ) /
            denominator;


        if (
            Number.isFinite(alpha)
        ) {

            values.push(
                alpha
            );

        }

    }


    if (!values.length) {
        return 0;
    }


    let alpha =
        median(
            values
        );


    alpha =
        clamp(
            alpha,
            0,
            MAX_ALPHA
        );


    if (
        alpha <
        MIN_ALPHA
    ) {

        return 0;

    }


    return alpha;
}


// ============================================================
// ALPHA RECONSTRUCTION
//
// O = (W - M*a) / (1-a)
//
// This is only applied when the estimated alpha is
// sufficiently reliable.
// ============================================================

function alphaReconstruct(
    watermarked,
    background,
    watermark,
    alpha
) {

    if (
        !watermarked ||
        !background ||
        !watermark
    ) {

        return background;
    }


    // If alpha is weak, local background is safer.
    if (
        alpha <
        MIN_ALPHA
    ) {

        return {

            r:
                background.r,

            g:
                background.g,

            b:
                background.b,

            a: 255

        };

    }


    const denominator =
        1 - alpha;


    if (
        denominator <
        0.12
    ) {

        return {

            r:
                background.r,

            g:
                background.g,

            b:
                background.b,

            a: 255

        };

    }


    let r =
        (
            watermarked.r -
            watermark.r *
            alpha
        ) /
        denominator;


    let g =
        (
            watermarked.g -
            watermark.g *
            alpha
        ) /
        denominator;


    let b =
        (
            watermarked.b -
            watermark.b *
            alpha
        ) /
        denominator;


    // Keep reconstruction close to the local
    // background to avoid extreme artifacts.

    const limit =
        80;


    r =
        clamp(
            r,
            background.r - limit,
            background.r + limit
        );


    g =
        clamp(
            g,
            background.g - limit,
            background.g + limit
        );


    b =
        clamp(
            b,
            background.b - limit,
            background.b + limit
        );


    return {

        r,
        g,
        b,
        a: 255

    };
}


// ============================================================
// EDGE CONTINUITY
//
// Keeps gradients flowing through the removed area.
// ============================================================

function preserveGradient(
    data,
    reconstructed,
    x,
    y,
    selection
) {

    const left =
        getPixel(
            data,
            x - 1,
            y
        );


    const right =
        getPixel(
            data,
            x + 1,
            y
        );


    const top =
        getPixel(
            data,
            x,
            y - 1
        );


    const bottom =
        getPixel(
            data,
            x,
            y + 1
        );


    const surrounding = [];


    if (left) {
        surrounding.push(left);
    }

    if (right) {
        surrounding.push(right);
    }

    if (top) {
        surrounding.push(top);
    }

    if (bottom) {
        surrounding.push(bottom);
    }


    if (!surrounding.length) {
        return reconstructed;
    }


    let r = 0;
    let g = 0;
    let b = 0;


    for (
        let i = 0;
        i < surrounding.length;
        i++
    ) {

        r += surrounding[i].r;
        g += surrounding[i].g;
        b += surrounding[i].b;

    }


    r /=
        surrounding.length;

    g /=
        surrounding.length;

    b /=
        surrounding.length;


    // Only gently pull toward the surrounding
    // gradient. Do NOT aggressively blur.

    return {

        r:
            reconstructed.r * 0.88 +
            r * 0.12,

        g:
            reconstructed.g * 0.88 +
            g * 0.12,

        b:
            reconstructed.b * 0.88 +
            b * 0.12,

        a: 255

    };
}


// ============================================================
// EDGE FEATHER
// ============================================================

function calculateBlend(
    x,
    y,
    selection
) {

    const left =
        x -
        selection.x;


    const right =
        selection.x +
        selection.width -
        1 -
        x;


    const top =
        y -
        selection.y;


    const bottom =
        selection.y +
        selection.height -
        1 -
        y;


    const distance =
        Math.min(
            left,
            right,
            top,
            bottom
        );


    if (
        distance >=
        EDGE_FEATHER
    ) {

        return 1;

    }


    let value =
        distance /
        EDGE_FEATHER;


    value =
        clamp(
            value,
            0,
            1
        );


    // Smoothstep
    return (
        value *
        value *
        (
            3 -
            2 *
            value
        )
    );
}


// ============================================================
// RECONSTRUCT WATERMARK AREA
// ============================================================

function reconstructWatermark(
    sourceData,
    selection
) {

    const width =
        imageCanvas.width;

    const height =
        imageCanvas.height;


    const result =
        new Uint8ClampedArray(
            sourceData
        );


    // --------------------------------------------
    // FIRST PASS
    // --------------------------------------------

    for (
        let y =
            selection.y;

        y <
            selection.y +
            selection.height;

        y++
    ) {

        for (
            let x =
                selection.x;

            x <
                selection.x +
                selection.width;

            x++
        ) {

            if (
                x < 0 ||
                y < 0 ||
                x >= width ||
                y >= height
            ) {

                continue;

            }


            const watermarked =
                getPixel(
                    sourceData,
                    x,
                    y
                );


            if (!watermarked) {
                continue;
            }


            const background =
                estimateLocalBackground(
                    sourceData,
                    x,
                    y,
                    selection
                );


            if (!background) {
                continue;
            }


            const watermark =
                estimateWatermarkColor(
                    watermarked,
                    background
                );


            const alpha =
                estimateAlpha(
                    watermarked,
                    background,
                    watermark
                );


            let reconstructed;


            if (
                alpha >=
                MIN_ALPHA
            ) {

                reconstructed =
                    alphaReconstruct(
                        watermarked,
                        background,
                        watermark,
                        alpha
                    );

            } else {

                reconstructed =
                    background;

            }


            reconstructed =
                preserveGradient(
                    sourceData,
                    reconstructed,
                    x,
                    y,
                    selection
                );


            const blend =
                calculateBlend(
                    x,
                    y,
                    selection
                );


            const index =
                getIndex(
                    x,
                    y
                );


            result[index] =
                Math.round(
                    sourceData[index] *
                    (1 - blend) +

                    reconstructed.r *
                    blend
                );


            result[index + 1] =
                Math.round(
                    sourceData[index + 1] *
                    (1 - blend) +

                    reconstructed.g *
                    blend
                );


            result[index + 2] =
                Math.round(
                    sourceData[index + 2] *
                    (1 - blend) +

                    reconstructed.b *
                    blend
                );


            result[index + 3] =
                255;

        }

    }


    // --------------------------------------------
    // RECONSTRUCTION PASSES
    //
    // Gradually improve internal pixels.
    // --------------------------------------------

    for (
        let pass = 0;
        pass <
        RECONSTRUCTION_PASSES;
        pass++
    ) {

        const previous =
            new Uint8ClampedArray(
                result
            );


        for (
            let y =
                selection.y;

            y <
                selection.y +
                selection.height;

            y++
        ) {

            for (
                let x =
                    selection.x;

                x <
                    selection.x +
                    selection.width;

                x++
            ) {

                const index =
                    getIndex(
                        x,
                        y
                    );


                const neighbors = [];


                const positions = [

                    [x - 1, y],

                    [x + 1, y],

                    [x, y - 1],

                    [x, y + 1]

                ];


                for (
                    let i = 0;
                    i <
                    positions.length;
                    i++
                ) {

                    const nx =
                        positions[i][0];

                    const ny =
                        positions[i][1];


                    if (
                        nx < 0 ||
                        ny < 0 ||
                        nx >= width ||
                        ny >= height
                    ) {

                        continue;

                    }


                    const ni =
                        getIndex(
                            nx,
                            ny
                        );


                    neighbors.push({

                        r:
                            previous[ni],

                        g:
                            previous[ni + 1],

                        b:
                            previous[ni + 2]

                    });

                }


                if (!neighbors.length) {
                    continue;
                }


                let r = 0;
                let g = 0;
                let b = 0;


                for (
                    let i = 0;
                    i < neighbors.length;
                    i++
                ) {

                    r +=
                        neighbors[i].r;

                    g +=
                        neighbors[i].g;

                    b +=
                        neighbors[i].b;

                }


                r /=
                    neighbors.length;

                g /=
                    neighbors.length;

                b /=
                    neighbors.length;


                // VERY LOW smoothing.
                // This avoids the heavy blur from
                // your previous algorithm.

                result[index] =
                    Math.round(
                        previous[index] *
                        0.90 +
                        r *
                        0.10
                    );


                result[index + 1] =
                    Math.round(
                        previous[index + 1] *
                        0.90 +
                        g *
                        0.10
                    );


                result[index + 2] =
                    Math.round(
                        previous[index + 2] *
                        0.90 +
                        b *
                        0.10
                    );

            }

        }

    }


    return result;
}


// ============================================================
// REMOVE WATERMARK
// ============================================================

removeButton.addEventListener(
    "click",
    function () {

        if (!currentImageData) {

            console.log(
                "Please upload an image first."
            );

            return;
        }


        if (!selection) {

            console.log(
                "Please select the watermark first."
            );

            return;
        }


        console.log(
            "Starting alpha-aware reconstruction..."
        );


        // --------------------------------------------
        // SAVE UNDO
        // --------------------------------------------

        history.push(
            cloneImageData(
                currentImageData
            )
        );


        // --------------------------------------------
        // SOURCE
        // --------------------------------------------

        const sourceData =
            new Uint8ClampedArray(
                currentImageData.data
            );


        // --------------------------------------------
        // RECONSTRUCT
        // --------------------------------------------

        const resultData =
            reconstructWatermark(
                sourceData,
                selection
            );


        // --------------------------------------------
        // UPDATE
        // --------------------------------------------

        currentImageData =
            new ImageData(
                resultData,
                imageCanvas.width,
                imageCanvas.height
            );


        renderImage();


        // --------------------------------------------
        // CLEAR SELECTION
        // --------------------------------------------

        selection = null;


        selectionCtx.clearRect(
            0,
            0,
            selectionCanvas.width,
            selectionCanvas.height
        );


        console.log(
            "Watermark reconstruction completed."
        );

    }
);


// ============================================================
// UNDO
// ============================================================

undoButton.addEventListener(
    "click",
    function () {

        if (!history.length) {

            console.log(
                "Nothing to undo."
            );

            return;
        }


        currentImageData =
            history.pop();


        renderImage();


        selection = null;


        selectionCtx.clearRect(
            0,
            0,
            selectionCanvas.width,
            selectionCanvas.height
        );


        console.log(
            "Undo complete."
        );

    }
);


// ============================================================
// RESET
// ============================================================

resetButton.addEventListener(
    "click",
    function () {

        if (!originalImageData) {

            console.log(
                "No image loaded."
            );

            return;
        }


        currentImageData =
            cloneImageData(
                originalImageData
            );


        history = [];

        selection = null;


        renderImage();


        selectionCtx.clearRect(
            0,
            0,
            selectionCanvas.width,
            selectionCanvas.height
        );


        console.log(
            "Image reset."
        );

    }
);


// ============================================================
// DOWNLOAD
// ============================================================

downloadButton.addEventListener(
    "click",
    function () {

        if (!currentImageData) {

            console.log(
                "No image available."
            );

            return;
        }


        renderImage();


        const link =
            document.createElement("a");


        link.download =
            "gemini-watermark-removed.png";


        link.href =
            imageCanvas.toDataURL(
                "image/png"
            );


        link.click();


        console.log(
            "Image downloaded."
        );

    }
);


// ============================================================
// WINDOW RESIZE
// ============================================================

window.addEventListener(
    "resize",
    function () {

        fitEditorToImage();

    }
);


// ============================================================
// INITIAL STATE
// ============================================================

console.log(
    "Gemini Watermark Remover initialized."
);