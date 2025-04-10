import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { CARDS, doRaritiesMatch, findCard, getCardImageUrl } from "./cards";
import {
  FlattenedTradeProposal,
  useAllUsers,
  useAuth,
  useTradeProposals,
} from "./firebase";

interface Filters {
  rarity?: string;
  set?: string;
}

interface PotentialTradeFilters {
  player?: string;
  rarity?: string;
  set?: string;
}

function App() {
  const { currentUser, isAuthLoading, performGoogleSignIn } = useAuth();
  const allUsers = useAllUsers();
  const [filters, setFilters] = useState<Filters>({});

  const [potentialTradeFilters, setPotentialTradeFilters] =
    useState<PotentialTradeFilters>({});

  const [maxSearchResults, setMaxSearchResults] = useState(9);

  const onSetSelected = (set: string) => {
    setFilters((f) => ({ ...f, set }));
  };

  const onRaritySelected = (rarity: string) => {
    setFilters((f) => ({ ...f, rarity }));
  };

  const onPotentialTradeSetSelected = (set: string) => {
    setPotentialTradeFilters((f) => ({ ...f, set }));
  };

  const onPotentialTradeRaritySelected = (rarity: string) => {
    setPotentialTradeFilters((f) => ({ ...f, rarity }));
  };

  const onPotentialTradePlayerSelected = (player: string) => {
    setPotentialTradeFilters((f) => ({ ...f, player }));
  };

  const loadMoreRef = useRef(null);

  useEffect(() => {
    const loadMoreImages = (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting) {
        setMaxSearchResults((n) => n + 9);
      }
    };

    const observer = new IntersectionObserver(loadMoreImages, {
      rootMargin: "100px",
    });

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [loadMoreRef.current]);

  const filteredCards = CARDS.filter((c) =>
    filters.set ? c.set === filters.set : true
  ).filter((c) => (filters.rarity ? c.rarity === filters.rarity : true));

  const [searchText, setSearchText] = useState("");

  const {
    tradeProposals,
    acceptTradeProposal,
    createTradeProposal,
    deleteTradeProposal,
  } = useTradeProposals();

  const flattenedTradeProposals = Object.entries(tradeProposals).reduce(
    (accumulator, [userId, proposals]) => {
      return {
        ...accumulator,
        [userId]: Object.entries(proposals).map(([key, proposal]) => ({
          key,
          ...proposal,
        })),
      };
    },
    {} as {
      [userId: string]: FlattenedTradeProposal[];
    }
  );

  const tradeableCards = filteredCards.filter(
    (c) =>
      c.rarity !== "Promo" &&
      c.rarity !== "👑" &&
      c.rarity !== "☆☆" &&
      c.rarity !== "☆☆☆"
  );

  const searchResults = useMemo(() => {
    return tradeableCards.filter((c) => {
      return c.name.toLowerCase().startsWith(searchText.toLowerCase());
    });
  }, [tradeableCards, searchText]);

  if (isAuthLoading) {
    return <span>Loading...</span>;
  }

  if (!currentUser) {
    return <button onClick={performGoogleSignIn}>Sign In</button>;
  }

  const myTradeProposals = flattenedTradeProposals[currentUser.uid] ?? [];
  const myOffers = myTradeProposals.filter((p) => p.type === "offer").reverse();
  const myRequests = myTradeProposals
    .filter((p) => p.type === "request")
    .reverse();

  const myOffersFiltered = myOffers.filter((t) =>
    filters.set ? t.set === filters.set : true
  );

  const myRequestsFiltered = myRequests.filter((t) =>
    filters.set ? t.set === filters.set : true
  );

  interface PotentialTrade {
    myOffer: FlattenedTradeProposal;
    myRequest: FlattenedTradeProposal;
    theirOffer: FlattenedTradeProposal;
    theirRequest: FlattenedTradeProposal;
    theirUserId: string;
    theirName: string;
  }

  const potentialTrades: PotentialTrade[] = [];
  for (const myOffer of myOffers) {
    for (const [theirUserId, proposals] of Object.entries(
      flattenedTradeProposals
    )) {
      if (theirUserId === currentUser.uid) {
        continue;
      }
      const theirRequest = proposals.find(
        (p) =>
          p.set === myOffer.set && p.id == myOffer.id && p.type === "request"
      );
      if (!theirRequest) {
        continue;
      }

      const theirOffers = proposals.filter(
        (theirOffer) =>
          theirOffer.type === "offer" &&
          myRequests.some(
            (myRequest) =>
              theirOffer.set === myRequest.set &&
              theirOffer.id === myRequest.id &&
              doRaritiesMatch(myOffer, myRequest)
          )
      );
      if (theirOffers.length === 0) {
        continue;
      }

      const theirName =
        allUsers
          .find((u) => u.uid === theirUserId)
          ?.displayName?.split(" ")[0] ?? "???";

      theirOffers.forEach((theirOffer) => {
        const myRequest = myRequests.find(
          (r) => r.set === theirOffer.set && r.id === theirOffer.id
        );
        if (!myRequest) {
          return;
        }
        if (
          // Don't show my same offer for duplicates of their offer.
          potentialTrades.some(
            (t) =>
              t.theirOffer.set === theirOffer.set &&
              t.theirOffer.id === theirOffer.id &&
              t.myOffer.key === myOffer.key
          )
        ) {
          return;
        }
        potentialTrades.push({
          myOffer,
          myRequest,
          theirOffer,
          theirRequest,
          theirUserId,
          theirName,
        });
      });
    }
  }

  const filteredPotentialTrades = potentialTrades
    .filter((t) =>
      potentialTradeFilters.set
        ? potentialTradeFilters.set === t.myRequest.set
        : true
    )
    .filter((t) =>
      potentialTradeFilters.rarity
        ? potentialTradeFilters.rarity === findCard(t.myRequest)?.rarity
        : true
    )
    .filter((t) =>
      potentialTradeFilters.player
        ? potentialTradeFilters.player === t.theirName
        : true
    );

  return (
    <>
      <input
        placeholder="Search"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
      <label>Set:</label>
      <select onChange={(event) => onSetSelected(event.target.value)}>
        <option value="">All Sets</option>
        <option value="A1">Genetic Apex</option>
        <option value="A1a">Mythical Island</option>
        <option value="A2">Space-Time Smackdown</option>
        <option value="A2a">Triumphant Light</option>
      </select>
      <label>Rarity:</label>
      <select onChange={(event) => onRaritySelected(event.target.value)}>
        <option value="">All Rarities</option>
        <option>◊</option>
        <option>◊◊</option>
        <option>◊◊◊</option>
        <option>◊◊◊◊</option>
        <option>☆</option>
      </select>
      <div className="search-results">
        {searchResults.length === 0 && "No tradeable cards found"}
        {searchResults.slice(0, maxSearchResults).map((c) => (
          <div className="search-result" key={`${c.set}-${c.id}`}>
            <img src={getCardImageUrl(c)} />
            <div className="search-result-controls">
              <button
                onClick={() => createTradeProposal(c, "offer", currentUser.uid)}
              >
                🙌
              </button>
              <button
                onClick={() =>
                  createTradeProposal(c, "request", currentUser.uid)
                }
              >
                🙏
              </button>
            </div>
          </div>
        ))}
        <div ref={loadMoreRef} />
      </div>
      <div className="trade-proposals">
        <h3>My Offers</h3>
        <div className="proposed-cards">
          {myOffersFiltered.length === 0 && "No offers found"}
          {myOffersFiltered.map((p) => (
            <img
              key={p.key}
              src={getCardImageUrl(p)}
              style={{ cursor: "pointer" }}
              onClick={() => deleteTradeProposal(currentUser.uid, p.key)}
            />
          ))}
        </div>
      </div>
      <div className="trade-proposals">
        <h3>My Requests</h3>
        {myRequestsFiltered.length === 0 && "No requests found"}
        <div className="proposed-cards">
          {myRequestsFiltered.map((p) => (
            <img
              key={p.key}
              src={getCardImageUrl(p)}
              style={{ cursor: "pointer" }}
              onClick={() => deleteTradeProposal(currentUser.uid, p.key)}
            />
          ))}
        </div>
      </div>
      <div className="trade-proposals">
        <h3>Potential Trades</h3>
        <label>Player:</label>
        <select
          onChange={(event) =>
            onPotentialTradePlayerSelected(event.target.value)
          }
        >
          <option value="">All Players</option>
          {allUsers
            .filter((u) => u.uid !== currentUser.uid)
            .map((u) => (
              <option>{u.displayName?.split(" ")[0] ?? "???"}</option>
            ))}
        </select>
        <label>Set:</label>
        <select
          onChange={(event) => onPotentialTradeSetSelected(event.target.value)}
        >
          <option value="">All Sets</option>
          <option value="A1">Genetic Apex</option>
          <option value="A1a">Mythical Island</option>
          <option value="A2">Space-Time Smackdown</option>
          <option value="A2a">Triumphant Light</option>
        </select>
        <label>Rarity:</label>
        <select
          onChange={(event) =>
            onPotentialTradeRaritySelected(event.target.value)
          }
        >
          <option value="">All Rarities</option>
          <option>◊</option>
          <option>◊◊</option>
          <option>◊◊◊</option>
          <option>◊◊◊◊</option>
          <option>☆</option>
        </select>
        {filteredPotentialTrades.length === 0 && "No potential trades found"}
        <div>
          {filteredPotentialTrades.map(
            ({
              myOffer,
              myRequest,
              theirOffer,
              theirRequest,
              theirName,
              theirUserId,
            }) => (
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "2rem",
                  textAlign: "center",
                  width: "100%",
                }}
                key={`${myOffer.key} ${theirOffer.key}`}
              >
                <div className="potential-trade-info">
                  <img src={getCardImageUrl(myOffer)} />
                  <div>You send</div>
                </div>
                <div>
                  <div>➡️</div>
                  <br />
                  <div>⬅️</div>
                </div>
                <div className="potential-trade-info">
                  <img src={getCardImageUrl(theirOffer)} />
                  <div>{theirName} sends</div>
                </div>
                <button
                  onClick={() =>
                    acceptTradeProposal(
                      myOffer,
                      myRequest,
                      currentUser.uid,
                      theirOffer,
                      theirRequest,
                      theirUserId,
                      theirName
                    )
                  }
                >
                  ✅
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}

export default App;
