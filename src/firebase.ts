import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  User,
} from "firebase/auth";
import { getDatabase, onValue, push, ref, set } from "firebase/database";
import { useCallback, useEffect, useState } from "react";
import { Card, findCard } from "./cards";

const app = initializeApp({
  apiKey: "AIzaSyAXAGWEO2PO_VqQVi-iXAd_wTQOkWn7JU4",
  authDomain: "pocket-tcg.firebaseapp.com",
  databaseURL: "https://pocket-tcg-default-rtdb.firebaseio.com",
  projectId: "pocket-tcg",
  storageBucket: "pocket-tcg.firebasestorage.app",
  messagingSenderId: "573246229549",
  appId: "1:573246229549:web:3375327902e5ca3439bca4",
});

const auth = getAuth(app);
const database = getDatabase(app);
const provider = new GoogleAuthProvider();

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    auth.authStateReady().then(() => {
      setIsAuthLoading(false);
    });

    auth.onAuthStateChanged((user) => {
      if (user) {
        set(ref(database, `/users/${user.uid}`), {
          displayName: user.displayName,
          uid: user.uid,
        });
      }
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
  }, []);

  const performGoogleSignIn = useCallback(() => {
    signInWithPopup(auth, provider).catch((error) => {
      console.error(error);
    });
  }, [auth, provider]);

  return { currentUser, isAuthLoading, performGoogleSignIn };
};

export const useAllUsers = () => {
  const [users, setUsers] = useState<Partial<User>[]>([]);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, `/users`), (snapshot) => {
      setUsers(Object.values(snapshot.val()));
    });
    return unsubscribe;
  }, []);

  return users;
};

export type TradeProposals = {
  [userId: string]: {
    [key: string]: {
      id: string;
      set: string;
      type: TradeProposalType;
    };
  };
};

export interface FlattenedTradeProposal {
  key: string;
  id: string;
  set: string;
  type: TradeProposalType;
}

export type TradeProposalType = "offer" | "request";

export const useTradeProposals = () => {
  const [tradeProposals, setTradeProposals] = useState<TradeProposals | null>(
    null
  );

  useEffect(() => {
    const unsubscribe = onValue(
      ref(database, `/trade-proposals`),
      (snapshot) => {
        setTradeProposals(snapshot.val());
      }
    );
    return () => unsubscribe();
  }, []);

  const acceptTradeProposal = (
    myOffer: FlattenedTradeProposal,
    myRequest: FlattenedTradeProposal,
    myUserId: string,
    theirOffer: FlattenedTradeProposal,
    theirRequest: FlattenedTradeProposal,
    theirUserId: string,
    theirName: string
  ) => {
    const myCard = findCard(myOffer)!;
    const theirCard = findCard(theirOffer)!;
    if (
      !window.confirm(
        `Trade your ${myCard.name} for ${theirName}'s ${theirCard.name}?`
      )
    ) {
      return;
    }

    set(ref(database, `/trade-proposals/${myUserId}/${myOffer.key}`), null);
    set(ref(database, `/trade-proposals/${myUserId}/${myRequest.key}`), null);
    set(
      ref(database, `/trade-proposals/${theirUserId}/${theirOffer.key}`),
      null
    );
    set(
      ref(database, `/trade-proposals/${theirUserId}/${theirRequest.key}`),
      null
    );
  };

  const createTradeProposal = (
    card: Card,
    type: TradeProposalType,
    userId: string
  ) => {
    set(push(ref(database, `/trade-proposals/${userId}`)), {
      id: card.id,
      set: card.set,
      type,
    });
  };

  const deleteTradeProposal = (userId: string, key: string) => {
    set(ref(database, `/trade-proposals/${userId}/${key}`), null);
  };

  return {
    tradeProposals: tradeProposals ?? {},
    acceptTradeProposal,
    createTradeProposal,
    deleteTradeProposal,
  };
};
