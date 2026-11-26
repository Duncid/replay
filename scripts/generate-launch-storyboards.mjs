// Native launch layout: centered wordmark plus 22 white / 15 black keys.
// Each app receives its own storyboard; neither loads resources from the other.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const w=1194,h=834,keyHeight=266,whiteWidth=(w-29)/22;
let serial=0;
const constraint=(attrs)=>`<constraint ${attrs} id="con-${String(serial++).padStart(3,'0')}-key"/>`;
const whites=Array.from({length:22},(_,i)=>`<imageView opaque="NO" userInteractionEnabled="NO" contentMode="scaleToFill" image="LaunchWhiteKey" translatesAutoresizingMaskIntoConstraints="NO" id="wht-${String(i).padStart(2,'0')}-key"><rect key="frame" x="${i*(whiteWidth+1)}" y="0" width="${whiteWidth}" height="${keyHeight}"/></imageView>`).join('\n');
let before=0;const blacks=[];
for(let midi=48;midi<=84;midi++) {
 if([1,3,6,8,10].includes(midi%12)) blacks.push(before-1);
 else before++;
}
const blackViews=blacks.map((preceding,i)=>`<imageView opaque="NO" userInteractionEnabled="NO" contentMode="scaleToFill" image="LaunchBlackKey" translatesAutoresizingMaskIntoConstraints="NO" id="blk-${String(i).padStart(2,'0')}-key"><rect key="frame" x="${4+(preceding+1)*(whiteWidth+1)-.5-(whiteWidth*.58+16)/2}" y="${h-keyHeight-4}" width="${whiteWidth*.58+16}" height="${keyHeight*.56+8}"/></imageView>`).join('\n');
const constraints=[
 constraint('firstItem="word-mark-img" firstAttribute="centerX" secondItem="launch-root-vw" secondAttribute="centerX"'),
 constraint('firstItem="word-mark-img" firstAttribute="centerY" secondItem="launch-root-vw" secondAttribute="centerY"'),
 constraint('firstItem="key-stack-vw" firstAttribute="leading" secondItem="launch-root-vw" secondAttribute="leading" constant="4"'),
 constraint('firstItem="launch-root-vw" firstAttribute="trailing" secondItem="key-stack-vw" secondAttribute="trailing" constant="4"'),
 constraint('firstItem="launch-root-vw" firstAttribute="bottom" secondItem="key-stack-vw" secondAttribute="bottom" constant="4"'),
 // Short landscape windows can shrink the keys without covering the wordmark.
 constraint('firstItem="key-stack-vw" firstAttribute="top" relation="greaterThanOrEqual" secondItem="word-mark-img" secondAttribute="bottom" constant="24"'),
];
blacks.forEach((preceding,i)=>{
 const black=`blk-${String(i).padStart(2,'0')}-key`,white=`wht-${String(preceding).padStart(2,'0')}-key`;
 constraints.push(
 constraint(`firstItem="${black}" firstAttribute="centerX" secondItem="${white}" secondAttribute="trailing" constant="0.5"`),
 constraint(`firstItem="${black}" firstAttribute="top" secondItem="key-stack-vw" secondAttribute="top"`),
 constraint(`firstItem="${black}" firstAttribute="width" secondItem="${white}" secondAttribute="width" multiplier="0.58" constant="16"`),
 constraint(`firstItem="${black}" firstAttribute="height" secondItem="key-stack-vw" secondAttribute="height" multiplier="0.56" constant="8"`));
});
const xml=`<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="23501" targetRuntime="iOS.CocoaTouch" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="launch-main-vc">
<device id="ipad11_0rounded" orientation="landscape" layout="fullscreen" appearance="dark"/>
<dependencies><deployment identifier="iOS"/><plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="23501"/><capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/></dependencies>
<scenes><scene sceneID="launch-main-sc"><objects>
<viewController id="launch-main-vc" sceneMemberID="viewController"><view key="view" contentMode="scaleToFill" id="launch-root-vw">
<rect key="frame" x="0" y="0" width="${w}" height="${h}"/>
<autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
<subviews>
<imageView opaque="NO" userInteractionEnabled="NO" contentMode="scaleAspectFit" image="LaunchWordmark" translatesAutoresizingMaskIntoConstraints="NO" id="word-mark-img"><rect key="frame" x="${(w-400)/2}" y="${(h-120)/2}" width="400" height="120"/><constraints>${constraint('firstAttribute="width" constant="400"')}${constraint('firstAttribute="height" constant="120"')}</constraints></imageView>
<stackView opaque="NO" contentMode="scaleToFill" distribution="fillEqually" spacing="1" translatesAutoresizingMaskIntoConstraints="NO" id="key-stack-vw"><rect key="frame" x="4" y="${h-keyHeight-4}" width="${w-8}" height="${keyHeight}"/><subviews>${whites}</subviews><constraints>${constraint('firstAttribute="height" priority="750" constant="266"')}</constraints></stackView>
${blackViews}
</subviews>
<color key="backgroundColor" red="0.0235294117647" green="0.0274509803922" blue="0.0352941176471" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
<constraints>${constraints.join('\n')}</constraints>
</view></viewController><placeholder placeholderIdentifier="IBFirstResponder" id="launch-first-rs" sceneMemberID="firstResponder"/>
</objects></scene></scenes>
<resources><image name="LaunchWordmark" width="400" height="120"/><image name="LaunchWhiteKey" width="72" height="266"/><image name="LaunchBlackKey" width="58" height="157"/></resources>
</document>\n`;
for(const file of ['ios/App/App/Base.lproj/LaunchScreen.storyboard','ios-learn-native/ReplayLearn/LaunchScreen.storyboard']) {
 await mkdir(dirname(resolve(root,file)),{recursive:true});await writeFile(resolve(root,file),xml);
}
