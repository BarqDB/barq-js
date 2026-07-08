# React Native Template Realm

## Usage

Simple React Native template to quickly get started with Realm.

This app implements a simple todo list, using Realm for persistence and the [Realm React](https://github.com/BarqDB/barq-js/tree/master/packages/react) hooks for React integration. It supports sync, allowing users to login and sync their todo lists across multiple devices.

## 🚀 How to use

```
npx react-native init AwesomeRealmProject --template @barq/react-native-template
```

## 🏃 How to build and run locally

- [Setup React Native development Environment](https://reactnative.dev/docs/environment-setup)
- Build/Run on iOS 🍎
```
npm run ios
```
- Build/Run on Android 🤖
```
npm run android
```

## 💻 Start the Dev Client

```
npm start
```

## 💾 Testing changes to the template when developing

To test the template locally, run it like any other React Native app: `npm i && npx pod-install` then `npm run ios`.

## 🔀 Setting up sync

See https://github.com/BarqDB/barq-js/blob/main/templates/docs/sync-setup.md for instructions.

## 📝 Notes
- [React Native docs](https://reactnative.dev/docs/getting-started)
- [React Hooks](https://reactjs.org/docs/hooks-intro.html)
- [Setting Up Realm Sync](https://docs.mongodb.com/realm/sdk/react-native/quick-start/)
- [Realm JS Documentation](https://docs.mongodb.com/realm/sdk/react-native/)
- [@barq/react Readme](https://github.com/BarqDB/barq-js/tree/master/packages/react#readme)
